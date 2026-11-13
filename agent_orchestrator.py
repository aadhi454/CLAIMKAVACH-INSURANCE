"""Single bounded orchestrator with a typed tool registry for ClaimKavach MVP.

Enforces strict security and architectural invariants:
- Masks PII locally before any optional Gemini call or trace recording.
- Clearly labels deterministic fallback as 'DEMO FALLBACK' when GEMINI_API_KEY is absent or fails.
- Bounded tool execution (MAX_TOOL_TURNS = 7).
- Backend owns all database writes, rule approvals, validation findings, and FHIR gate checks.
"""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from models import (
    BaseModel,
    ClaimPacket,
    ExtractedDoc,
    Field,
    ToolTrace,
    ValidationFinding,
    utc_now_iso,
)
from database import (
    DEFAULT_DB_PATH,
    clear_claim_documents,
    get_claim,
    get_claim_documents,
    get_findings,
    log_audit,
    save_claim,
    save_extracted_doc,
    save_findings,
    save_tool_traces,
)
from document_processor import process_pdf_document
from fhir_builder import (
    FHIRGateBlockedError,
    build_fhir_r4_bundle,
    check_fhir_gate,
    validate_fhir_bundle_structure,
)
from pii_masker import (
    GLOBAL_TOKEN_VAULT,
    PRIVACY_LIMITATION_NOTICE,
    ClaimTokenVault,
    build_gemini_payload,
    mask_dict,
    mask_text,
)
from rules_engine import (
    get_applicable_rules,
    get_excluded_rules_with_reasons,
    validate_claim_evidence,
    validate_cross_document_consistency,
)


MAX_TOOL_TURNS = 7

ALLOWED_TOOLS = (
    "classify_documents",
    "extract_document_fields",
    "extract_claim_fields",
    "retrieve_applicable_rules",
    "validate_evidence",
    "validate_required_evidence",
    "validate_consistency",
    "validate_claim_consistency",
    "generate_fhir_draft",
    "generate_fhir_r4_bundle",
    "validate_fhir_structure",
    "validate_fhir_r4_bundle",
)


class ToolCallInput(BaseModel):
    tool_name: str
    reason: str
    arguments: Dict[str, Any] = Field(default_factory=dict)


class ToolCallOutput(BaseModel):
    tool_name: str
    status: str
    summary: Dict[str, Any]


def compute_run_fingerprint(claim: ClaimPacket, docs: List[ExtractedDoc], rule_ids: List[str]) -> str:
    payload = {
        "claim_id": claim.claim_id,
        "insurer": claim.insurer,
        "policy_code": claim.policy_code,
        "claim_type": claim.claim_type,
        "relevant_date": claim.relevant_date,
        "diagnosis": claim.diagnosis,
        "care_setting": claim.care_setting,
        "docs": [
            {
                "filename": d.filename,
                "sha256": d.file_sha256,
                "doc_type": d.document_type,
                "fields": {k: v.value for k, v in sorted(d.extracted_fields.items())},
            }
            for d in sorted(docs, key=lambda x: x.filename)
        ],
        "rules": sorted(rule_ids),
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:16]


class ClaimReadinessOrchestrator:
    """Single bounded orchestrator with typed tool validation and PII-masked trace logging."""

    def __init__(
        self,
        db_path: str = DEFAULT_DB_PATH,
        vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
        force_fallback: bool = False,
        max_turns: int = MAX_TOOL_TURNS,
    ) -> None:
        self.db_path = db_path
        self.vault = vault
        self.force_fallback = force_fallback
        self.max_turns = min(max_turns, MAX_TOOL_TURNS)
        self.last_outbound_payloads: List[Dict[str, Any]] = []

    def _is_gemini_active(self) -> bool:
        if self.force_fallback:
            return False
        key = os.environ.get("GEMINI_API_KEY", "").strip()
        return bool(key and key != "MY_GEMINI_API_KEY")

    def _get_optional_gemini_annotation(
        self,
        claim_id: str,
        masked_doc_summaries: List[Dict[str, Any]],
    ) -> Tuple[str, str, Dict[str, Any]]:
        """Send ONLY masked, minimum-necessary document metadata to Gemini if configured.
        Falls back deterministically to 'DEMO FALLBACK' if absent or on any error.
        """
        outbound_payload = build_gemini_payload(
            claim_id=claim_id,
            task="summarize_masked_packet_structure",
            raw_text_or_data=json.dumps({"documents": masked_doc_summaries}),
            vault=self.vault,
        )
        # Always record the simulated/actual outbound payload in masked form for audit/test verification
        self.last_outbound_payloads.append(outbound_payload)

        if not self._is_gemini_active():
            return (
                "DEMO FALLBACK",
                "Deterministic local workflow (GEMINI_API_KEY not configured or fallback requested).",
                outbound_payload,
            )

        try:
            from google import genai

            client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
            prompt = (
                "You are assisting a hospital claim readiness check. "
                "Given the following PII-masked document types and field keys (never guess missing values), "
                "return a one-sentence readiness note:\n"
                + json.dumps(outbound_payload)
            )
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            note = (resp.text or "").strip() or "Gemini masked classification review completed."
            return "GEMINI_MASKED", mask_text(claim_id, note[:240], vault=self.vault), outbound_payload
        except Exception as exc:
            return (
                "DEMO FALLBACK",
                f"DEMO FALLBACK active (Gemini unavailable: {type(exc).__name__}).",
                outbound_payload,
            )

    def execute_claim_pipeline(
        self,
        claim: ClaimPacket,
        pdf_paths: Optional[List[str | Path]] = None,
        force_ocr_unavailable: bool = False,
        preserve_dispositions: bool = True,
        attempt_fhir_if_ready: bool = False,
        replace_documents: bool = False,
    ) -> Dict[str, Any]:
        """Run the bounded readiness pipeline for a claim packet."""
        save_claim(claim, db_path=self.db_path)
        traces: List[ToolTrace] = []
        turn_counter = 0

        def _record_trace(
            tool_name: str,
            reason: str,
            raw_in: Dict[str, Any],
            raw_out: Dict[str, Any],
            mode: str,
        ) -> None:
            nonlocal turn_counter
            if tool_name not in ALLOWED_TOOLS:
                raise ValueError(f"Unauthorized tool requested: {tool_name}")
            if turn_counter >= self.max_turns:
                raise RuntimeError(f"Tool turn limit ({self.max_turns}) exceeded.")
            turn_counter += 1
            validated_in = ToolCallInput(tool_name=tool_name, reason=reason, arguments=raw_in)
            validated_out = ToolCallOutput(tool_name=tool_name, status="OK", summary=raw_out)

            redacted_in = json.dumps(mask_dict(claim.claim_id, validated_in.arguments, vault=self.vault))
            redacted_out = json.dumps(mask_dict(claim.claim_id, validated_out.summary, vault=self.vault))

            traces.append(
                ToolTrace(
                    trace_id=f"TRC-{uuid.uuid4().hex[:8]}",
                    claim_id=claim.claim_id,
                    turn_index=turn_counter,
                    tool=tool_name,
                    reason=mask_text(claim.claim_id, reason, vault=self.vault),
                    redacted_input_summary=redacted_in,
                    redacted_output_summary=redacted_out,
                    mode=mode,
                    timestamp=utc_now_iso(),
                )
            )

        # Process PDFs if provided, else load existing claim documents
        docs: List[ExtractedDoc] = []
        if pdf_paths is not None:
            if replace_documents:
                clear_claim_documents(claim.claim_id, db_path=self.db_path)
            for p in pdf_paths:
                doc = process_pdf_document(
                    claim_id=claim.claim_id,
                    pdf_path=p,
                    force_ocr_unavailable=force_ocr_unavailable,
                    vault=self.vault,
                )
                save_extracted_doc(doc, db_path=self.db_path)
                docs.append(doc)
        else:
            docs = get_claim_documents(claim.claim_id, db_path=self.db_path)

        # Auto-infer primary diagnosis into claim.diagnosis if not explicitly set by user
        if not claim.diagnosis.strip():
            for d in docs:
                diag_pf = d.extracted_fields.get("primary_diagnosis")
                if diag_pf and diag_pf.is_known and diag_pf.value:
                    claim.diagnosis = diag_pf.value
                    break

        masked_doc_summaries = [
            {
                "filename": d.filename,
                "document_type": d.document_type,
                "document_subtype": d.document_subtype,
                "processing_mode": d.processing_mode,
                "confidence": d.confidence,
                "fields_found": sorted(list(d.extracted_fields.keys())),
            }
            for d in docs
        ]
        active_mode, mode_note, outbound_preview = self._get_optional_gemini_annotation(
            claim.claim_id, masked_doc_summaries
        )

        # Turn 1: classify_documents
        _record_trace(
            tool_name="classify_documents",
            reason="Classify uploaded claim packet PDFs and detect digital text vs scanned OCR status.",
            raw_in={"claim_id": claim.claim_id, "file_count": len(docs), "files": [d.filename for d in docs]},
            raw_out={
                "classified": [
                    {
                        "file": d.filename,
                        "type": d.document_type,
                        "subtype": d.document_subtype,
                        "mode": d.processing_mode,
                        "confidence": d.confidence,
                    }
                    for d in docs
                ],
                "orchestrator_note": mode_note,
            },
            mode=active_mode,
        )

        # Turn 2: extract_document_fields
        extracted_summary = {
            d.filename: {
                fname: pf.value for fname, pf in d.extracted_fields.items() if pf.is_known
            }
            for d in docs
        }
        _record_trace(
            tool_name="extract_document_fields",
            reason="Extract structured clinical and policy fields with page and line provenance; mask PII locally.",
            raw_in={"claim_id": claim.claim_id, "documents": [d.filename for d in docs]},
            raw_out={"extracted_fields_by_doc": extracted_summary},
            mode=active_mode,
        )

        # Turn 3: retrieve_applicable_rules
        applicable_rules = get_applicable_rules(
            insurer=claim.insurer,
            policy_code=claim.policy_code,
            claim_type=claim.claim_type,
            relevant_date=claim.relevant_date,
            diagnosis=claim.diagnosis,
            db_path=self.db_path,
        )
        excluded_rules = get_excluded_rules_with_reasons(
            insurer=claim.insurer,
            policy_code=claim.policy_code,
            claim_type=claim.claim_type,
            relevant_date=claim.relevant_date,
            diagnosis=claim.diagnosis,
            db_path=self.db_path,
        )
        _record_trace(
            tool_name="retrieve_applicable_rules",
            reason="Retrieve approved, effective synthetic rules matching insurer, policy, claim type, diagnosis, and date.",
            raw_in={
                "insurer": claim.insurer,
                "policy_code": claim.policy_code,
                "claim_type": claim.claim_type,
                "relevant_date": claim.relevant_date,
                "diagnosis": claim.diagnosis,
            },
            raw_out={
                "applicable_rule_ids": [f"{r.rule_id}@v{r.version}" for r in applicable_rules],
                "count": len(applicable_rules),
                "excluded_count": len(excluded_rules),
            },
            mode=active_mode,
        )

        # Turn 4: validate_evidence
        evidence_findings = validate_claim_evidence(claim, docs, applicable_rules, db_path=self.db_path)
        _record_trace(
            tool_name="validate_evidence",
            reason="Validate required documents, content patterns, and required fields against approved rules.",
            raw_in={"rule_ids": [r.rule_id for r in applicable_rules]},
            raw_out={
                "pass": sum(1 for f in evidence_findings if f.status == "PASS"),
                "fail": sum(1 for f in evidence_findings if f.status == "FAIL"),
                "review": sum(1 for f in evidence_findings if f.status == "REVIEW"),
            },
            mode=active_mode,
        )

        # Turn 5: validate_consistency
        consistency_findings = validate_cross_document_consistency(claim, docs)
        _record_trace(
            tool_name="validate_consistency",
            reason="Check cross-document consistency for patient ID, name, policy ID, dates, and diagnosis.",
            raw_in={
                "checked_fields": [
                    "patient_id",
                    "patient_name",
                    "policy_id",
                    "admission_date",
                    "discharge_date",
                    "primary_diagnosis",
                ]
            },
            raw_out={
                "pass": sum(1 for f in consistency_findings if f.status == "PASS"),
                "review": sum(1 for f in consistency_findings if f.status == "REVIEW"),
            },
            mode=active_mode,
        )

        rule_version_ids = [f"{r.rule_id}@v{r.version}" for r in applicable_rules]
        run_fingerprint = compute_run_fingerprint(claim, docs, rule_version_ids)

        all_findings = save_findings(
            claim_id=claim.claim_id,
            findings=evidence_findings + consistency_findings,
            preserve_dispositions=preserve_dispositions,
            run_fingerprint=run_fingerprint,
            db_path=self.db_path,
        )

        # Update claim status based on gate
        gate_allowed, blocking_reasons = check_fhir_gate(all_findings)
        claim.status = "READY_FOR_FHIR" if gate_allowed else "NEEDS_ATTENTION"
        save_claim(claim, actor="orchestrator", db_path=self.db_path)

        fhir_bundle_payload: Optional[Dict[str, Any]] = None
        fhir_validation: Optional[Dict[str, Any]] = None

        if attempt_fhir_if_ready and gate_allowed and turn_counter + 2 <= self.max_turns:
            fhir_bundle_payload = build_fhir_r4_bundle(claim, docs, all_findings)
            _record_trace(
                tool_name="generate_fhir_draft",
                reason="Backend gate passed; generate evidence-backed FHIR R4 draft Bundle.",
                raw_in={"claim_id": claim.claim_id, "gate_allowed": True},
                raw_out={
                    "fhir_version": fhir_bundle_payload["fhir_version"],
                    "bundle_id": fhir_bundle_payload["bundle"].get("id"),
                },
                mode=active_mode,
            )
            fhir_validation = validate_fhir_bundle_structure(fhir_bundle_payload)
            _record_trace(
                tool_name="validate_fhir_structure",
                reason="Validate FHIR R4 Bundle resource schemas and internal references.",
                raw_in={"bundle_id": fhir_bundle_payload["bundle"].get("id")},
                raw_out={
                    "valid": fhir_validation["valid"],
                    "resource_count": fhir_validation["resource_count"],
                    "errors": fhir_validation["errors"],
                },
                mode=active_mode,
            )

        save_tool_traces(claim.claim_id, traces, db_path=self.db_path)
        log_audit(
            actor="ORCHESTRATOR",
            action="PIPELINE_EXECUTED",
            redacted_details=(
                f"Executed claim readiness pipeline in mode '{active_mode}' with {len(traces)} tool turns. "
                f"Gate allowed: {gate_allowed}. Run fingerprint: {run_fingerprint}."
            ),
            claim_id=claim.claim_id,
            db_path=self.db_path,
            vault=self.vault,
        )

        return {
            "claim": get_claim(claim.claim_id, db_path=self.db_path),
            "documents": docs,
            "applicable_rules": applicable_rules,
            "excluded_rules": excluded_rules,
            "findings": all_findings,
            "traces": traces,
            "mode": active_mode,
            "outbound_preview": outbound_preview,
            "privacy_notice": PRIVACY_LIMITATION_NOTICE,
            "gate_allowed": gate_allowed,
            "blocking_reasons": blocking_reasons,
            "fhir_bundle_payload": fhir_bundle_payload,
            "fhir_validation": fhir_validation,
        }

    def request_fhir_generation_via_tool(self, claim_id: str) -> Dict[str, Any]:
        """Attempt to generate FHIR R4 Bundle via orchestrator; strictly enforces backend gate."""
        claim = get_claim(claim_id, db_path=self.db_path)
        if not claim:
            raise ValueError(f"Claim {claim_id} not found.")
        docs = get_claim_documents(claim_id, db_path=self.db_path)
        findings = get_findings(claim_id, db_path=self.db_path)
        # Backend gate always owns permission—cannot be bypassed by model or caller
        bundle_payload = build_fhir_r4_bundle(claim, docs, findings)
        validation = validate_fhir_bundle_structure(bundle_payload)
        return {
            "bundle_payload": bundle_payload,
            "validation": validation,
        }
