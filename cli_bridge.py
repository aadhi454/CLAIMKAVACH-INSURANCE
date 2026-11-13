"""JSON CLI bridge connecting the local Express/React web preview directly to the Python ClaimKavach MVP engine."""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

from agent_orchestrator import ClaimReadinessOrchestrator
from database import (
    DEFAULT_DB_PATH,
    clear_claim_documents,
    create_or_version_rule,
    get_claim,
    get_claim_documents,
    get_findings,
    get_policy_configs,
    get_tool_traces,
    init_db,
    list_audit_logs,
    list_claims,
    list_rules,
    record_review_disposition,
    remove_claim_document,
    save_claim,
    save_extracted_doc,
    set_rule_approval_state,
    update_extracted_field_by_reviewer,
)
from document_processor import is_tesseract_available, process_pdf_document
from fhir_builder import (
    FHIR_BOUNDARY_DISCLAIMER,
    FHIR_R4_VERSION_LABEL,
    build_fhir_r4_bundle,
    check_fhir_gate,
    simulate_mock_nhcx_submission,
    validate_fhir_bundle_structure,
)
from models import ClaimPacket, Rule
from pii_masker import GLOBAL_TOKEN_VAULT, PRIVACY_LIMITATION_NOTICE, build_gemini_payload
from rules_engine import get_applicable_rules, get_excluded_rules_with_reasons
from sample_generator import generate_sample_pdfs


UPLOAD_DIR = Path("local_uploads")


def ensure_initialized() -> Dict[str, str]:
    init_db(DEFAULT_DB_PATH)
    sample_files = generate_sample_pdfs("sample_data")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return sample_files


def build_state_payload(active_claim_id: str | None = None) -> Dict[str, Any]:
    sample_files = ensure_initialized()
    claims = list_claims(DEFAULT_DB_PATH)
    if active_claim_id == "__NONE__":
        active_claim_id = None
    elif not active_claim_id and claims:
        active_claim_id = claims[0].claim_id
    elif active_claim_id and not get_claim(active_claim_id, DEFAULT_DB_PATH):
        active_claim_id = claims[0].claim_id if claims else None

    active_claim = get_claim(active_claim_id, DEFAULT_DB_PATH) if active_claim_id else None
    docs = get_claim_documents(active_claim_id, DEFAULT_DB_PATH) if active_claim_id else []
    findings = get_findings(active_claim_id, DEFAULT_DB_PATH) if active_claim_id else []
    traces = get_tool_traces(active_claim_id, DEFAULT_DB_PATH) if active_claim_id else []
    gate_ok, blocking_reasons = check_fhir_gate(findings) if findings else (False, ["No validated findings yet."])

    applicable_rules = []
    excluded_rules = []
    outbound_preview = None
    if active_claim:
        applicable_rules = [
            r.to_dict()
            for r in get_applicable_rules(
                insurer=active_claim.insurer,
                policy_code=active_claim.policy_code,
                claim_type=active_claim.claim_type,
                relevant_date=active_claim.relevant_date,
                diagnosis=active_claim.diagnosis,
                db_path=DEFAULT_DB_PATH,
            )
        ]
        excluded_rules = get_excluded_rules_with_reasons(
            insurer=active_claim.insurer,
            policy_code=active_claim.policy_code,
            claim_type=active_claim.claim_type,
            relevant_date=active_claim.relevant_date,
            diagnosis=active_claim.diagnosis,
            db_path=DEFAULT_DB_PATH,
        )
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
        outbound_preview = build_gemini_payload(
            claim_id=active_claim.claim_id,
            task="summarize_masked_packet_structure",
            raw_text_or_data=json.dumps({"documents": masked_doc_summaries}),
            vault=GLOBAL_TOKEN_VAULT,
        )

    fhir_bundle = None
    fhir_validation = None
    if gate_ok and active_claim and docs:
        try:
            fhir_bundle = build_fhir_r4_bundle(active_claim, docs, findings)
            fhir_validation = validate_fhir_bundle_structure(fhir_bundle)
        except Exception:
            fhir_bundle = None
            fhir_validation = None

    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    gemini_configured = bool(gemini_key and gemini_key != "MY_GEMINI_API_KEY")

    return {
        "system": {
            "gemini_configured": gemini_configured,
            "default_mode": "GEMINI_MASKED" if gemini_configured else "DEMO FALLBACK",
            "tesseract_available": is_tesseract_available(),
            "fhir_version": FHIR_R4_VERSION_LABEL,
            "fhir_disclaimer": FHIR_BOUNDARY_DISCLAIMER,
            "privacy_notice": PRIVACY_LIMITATION_NOTICE,
            "sample_files": {k: Path(v).name for k, v in sample_files.items()},
        },
        "policy_configs": get_policy_configs(DEFAULT_DB_PATH),
        "claims": [c.to_dict() for c in claims],
        "active_claim": active_claim.to_dict() if active_claim else None,
        "documents": [d.to_dict() for d in docs],
        "applicable_rules": applicable_rules,
        "excluded_rules": excluded_rules,
        "outbound_preview": outbound_preview,
        "findings": [f.to_dict() for f in findings],
        "traces": [t.to_dict() for t in traces],
        "rules": [r.to_dict() for r in list_rules(latest_only=False, db_path=DEFAULT_DB_PATH)],
        "audit_logs": [a.to_dict() for a in list_audit_logs(claim_id=active_claim_id, db_path=DEFAULT_DB_PATH)[:40]],
        "gate": {
            "allowed": gate_ok,
            "blocking_reasons": blocking_reasons,
        },
        "fhir_bundle": fhir_bundle,
        "fhir_validation": fhir_validation,
    }


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "state"
    raw_args = sys.argv[2] if len(sys.argv) > 2 else "{}"
    args = json.loads(raw_args)

    try:
        sample_files = ensure_initialized()
        if action == "state":
            out = build_state_payload(args.get("claim_id"))
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "process_claim":
            claim_id = (args.get("claim_id") or "CLM-USER-101").strip()
            insurer = args.get("insurer", "Fictional Insurer A")
            policy_code = args.get("policy_code", "A1")
            claim_type = args.get("claim_type", "Inpatient Cashless")
            relevant_date = args.get("relevant_date", "2026-10-10")
            diagnosis = args.get("diagnosis", "").strip()
            care_setting = args.get("care_setting", "inpatient").strip()
            force_fallback = bool(args.get("force_fallback", False))
            uploaded_files: List[Dict[str, str]] = args.get("uploaded_files") or []
            selected_sample_files: List[str] = args.get("selected_sample_files") or []

            pdf_paths: List[str] = []

            # 1. Include any sample files explicitly chosen by the user
            sample_dir = Path("sample_data")
            for s_name in selected_sample_files:
                candidate = sample_dir / Path(s_name).name
                if candidate.exists():
                    pdf_paths.append(str(candidate))
                elif s_name in sample_files and Path(sample_files[s_name]).exists():
                    pdf_paths.append(sample_files[s_name])

            # 2. Include real PDF files uploaded by the user
            if uploaded_files:
                claim_dir = UPLOAD_DIR / claim_id
                claim_dir.mkdir(parents=True, exist_ok=True)
                for uf in uploaded_files:
                    safe_name = Path(uf["filename"]).name
                    dest = claim_dir / safe_name
                    dest.write_bytes(base64.b64decode(uf["base64"]))
                    pdf_paths.append(str(dest))

            if not pdf_paths:
                raise ValueError("Please upload at least one PDF document (or attach a sample PDF) before validating.")

            claim = ClaimPacket(
                claim_id=claim_id,
                insurer=insurer,
                policy_code=policy_code,
                claim_type=claim_type,
                relevant_date=relevant_date,
                diagnosis=diagnosis,
                care_setting=care_setting,
                status="PROCESSING",
            )
            orch = ClaimReadinessOrchestrator(
                db_path=DEFAULT_DB_PATH,
                force_fallback=force_fallback,
            )
            orch.execute_claim_pipeline(
                claim,
                pdf_paths=pdf_paths,
                preserve_dispositions=False,
                attempt_fhir_if_ready=True,
                replace_documents=True,
            )
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "update_claim_context":
            claim_id = args["claim_id"]
            claim = get_claim(claim_id, DEFAULT_DB_PATH)
            if not claim:
                raise ValueError(f"Claim {claim_id} not found.")
            claim.insurer = args.get("insurer", claim.insurer)
            claim.policy_code = args.get("policy_code", claim.policy_code)
            claim.claim_type = args.get("claim_type", claim.claim_type)
            claim.relevant_date = args.get("relevant_date", claim.relevant_date)
            if "diagnosis" in args:
                claim.diagnosis = args["diagnosis"]
            if "care_setting" in args:
                claim.care_setting = args["care_setting"]
            save_claim(claim, actor="billing_clerk", db_path=DEFAULT_DB_PATH)
            orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH)
            orch.execute_claim_pipeline(
                claim,
                pdf_paths=None,
                preserve_dispositions=True,
                attempt_fhir_if_ready=True,
            )
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "upload_additional_docs":
            claim_id = args["claim_id"]
            claim = get_claim(claim_id, DEFAULT_DB_PATH)
            if not claim:
                raise ValueError(f"Claim {claim_id} not found.")
            uploaded_files: List[Dict[str, str]] = args.get("uploaded_files") or []
            selected_sample_files: List[str] = args.get("selected_sample_files") or []

            claim_dir = UPLOAD_DIR / claim_id
            claim_dir.mkdir(parents=True, exist_ok=True)
            for uf in uploaded_files:
                safe_name = Path(uf["filename"]).name
                dest = claim_dir / safe_name
                dest.write_bytes(base64.b64decode(uf["base64"]))
                new_doc = process_pdf_document(claim_id, dest)
                save_extracted_doc(new_doc, db_path=DEFAULT_DB_PATH)

            sample_dir = Path("sample_data")
            for s_name in selected_sample_files:
                candidate = sample_dir / Path(s_name).name
                if candidate.exists():
                    new_doc = process_pdf_document(claim_id, candidate)
                    save_extracted_doc(new_doc, db_path=DEFAULT_DB_PATH)
                elif s_name in sample_files and Path(sample_files[s_name]).exists():
                    new_doc = process_pdf_document(claim_id, sample_files[s_name])
                    save_extracted_doc(new_doc, db_path=DEFAULT_DB_PATH)

            orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH)
            orch.execute_claim_pipeline(claim, pdf_paths=None, preserve_dispositions=True, attempt_fhir_if_ready=True)
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "remove_document":
            claim_id = args["claim_id"]
            doc_id = args["doc_id"]
            remove_claim_document(claim_id, doc_id, db_path=DEFAULT_DB_PATH)
            claim = get_claim(claim_id, DEFAULT_DB_PATH)
            if claim:
                docs_left = get_claim_documents(claim_id, DEFAULT_DB_PATH)
                if docs_left:
                    orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH)
                    orch.execute_claim_pipeline(claim, pdf_paths=None, preserve_dispositions=True, attempt_fhir_if_ready=True)
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "record_disposition":
            claim_id = args["claim_id"]
            finding_id = args["finding_id"]
            reviewer = args["reviewer"]
            rationale = args["rationale"]
            record_review_disposition(
                claim_id=claim_id,
                finding_id=finding_id,
                reviewer=reviewer,
                rationale=rationale,
                db_path=DEFAULT_DB_PATH,
            )
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "confirm_field":
            claim_id = args["claim_id"]
            doc_id = args["doc_id"]
            field_name = args["field_name"]
            new_value = args["new_value"]
            reviewer = args["reviewer"]
            rationale = args["rationale"]
            update_extracted_field_by_reviewer(
                claim_id=claim_id,
                doc_id=doc_id,
                field_name=field_name,
                new_value=new_value,
                reviewer=reviewer,
                rationale=rationale,
                db_path=DEFAULT_DB_PATH,
            )
            claim = get_claim(claim_id, DEFAULT_DB_PATH)
            if claim:
                orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH)
                orch.execute_claim_pipeline(claim, pdf_paths=None, preserve_dispositions=True, attempt_fhir_if_ready=True)
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "add_missing_doc":
            claim_id = args["claim_id"]
            doc_key = args.get("doc_key", "investigation_report")
            target_path = sample_files.get(doc_key) or str(Path("sample_data") / doc_key)
            new_doc = process_pdf_document(claim_id, target_path)
            save_extracted_doc(new_doc, db_path=DEFAULT_DB_PATH)
            claim = get_claim(claim_id, DEFAULT_DB_PATH)
            if claim:
                orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH)
                orch.execute_claim_pipeline(claim, pdf_paths=None, preserve_dispositions=True, attempt_fhir_if_ready=True)
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "rule_state":
            rule_id = args["rule_id"]
            new_state = args["new_state"]
            actor = args.get("actor", "admin_reviewer")
            set_rule_approval_state(rule_id, new_state, actor=actor, db_path=DEFAULT_DB_PATH)
            claim_id = args.get("claim_id")
            if claim_id:
                claim = get_claim(claim_id, DEFAULT_DB_PATH)
                if claim:
                    orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH)
                    orch.execute_claim_pipeline(claim, pdf_paths=None, preserve_dispositions=True, attempt_fhir_if_ready=True)
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "save_rule":
            r_data = args["rule"]
            actor = args.get("actor", "admin_reviewer")
            create_or_version_rule(
                Rule(
                    rule_id=r_data["rule_id"],
                    insurer=r_data["insurer"],
                    policy_code=r_data["policy_code"],
                    claim_type=r_data["claim_type"],
                    conditions=r_data.get("conditions", []),
                    description=r_data["description"],
                    required_documents=r_data.get("required_documents", []),
                    required_fields=r_data.get("required_fields", []),
                    effective_start=r_data.get("effective_start", "2025-01-01"),
                    effective_end=r_data.get("effective_end", "2027-12-31"),
                    approval_state=r_data.get("approval_state", "APPROVED"),
                    source_reference=r_data.get("source_reference", "SYNTHETIC DEMO DATA - Admin Rule"),
                    approver=actor if r_data.get("approval_state") == "APPROVED" else None,
                    is_synthetic=True,
                ),
                actor=actor,
                db_path=DEFAULT_DB_PATH,
            )
            claim_id = args.get("claim_id")
            if claim_id:
                claim = get_claim(claim_id, DEFAULT_DB_PATH)
                if claim:
                    orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH)
                    orch.execute_claim_pipeline(claim, pdf_paths=None, preserve_dispositions=True, attempt_fhir_if_ready=True)
            out = build_state_payload(claim_id)
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "mock_nhcx":
            claim_id = args["claim_id"]
            simulate_mode = args.get("simulate_mode", "auto")
            claim = get_claim(claim_id, DEFAULT_DB_PATH)
            docs = get_claim_documents(claim_id, DEFAULT_DB_PATH)
            findings = get_findings(claim_id, DEFAULT_DB_PATH)
            gate_ok, _ = check_fhir_gate(findings)
            bundle_payload = None
            if gate_ok and claim:
                bundle_payload = build_fhir_r4_bundle(claim, docs, findings)
            mock_res = simulate_mock_nhcx_submission(
                claim_id=claim_id,
                findings=findings,
                bundle_payload=bundle_payload,
                simulate_mode=simulate_mode,
            )
            print(json.dumps({"ok": True, "mock_response": mock_res}))
            return

        raise ValueError(f"Unknown action: {action}")
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))


if __name__ == "__main__":
    main()
