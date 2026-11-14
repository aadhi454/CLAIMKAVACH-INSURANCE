"""JSON CLI bridge connecting the local Express/React web preview directly to the Python ClaimKavach MVP engine."""

from __future__ import annotations

import base64
import json
import os
import sys
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from agent_orchestrator import ClaimReadinessOrchestrator
from database import (
    DEFAULT_DB_PATH,
    authenticate_api_key,
    authenticate_insurer,
    clear_claim_documents,
    create_dispatched_claim,
    create_api_key,
    create_insurer,
    create_insurer_rule,
    create_or_version_rule,
    get_claim,
    get_claim_documents,
    get_demo_api_key,
    get_findings,
    get_policy_configs,
    get_tool_traces,
    init_db,
    list_api_keys,
    list_audit_logs,
    list_claims,
    list_dispatched_claims,
    list_insurers,
    list_insurer_policies,
    list_rules,
    record_review_disposition,
    revoke_api_key,
    remove_claim_document,
    save_claim,
    save_extracted_doc,
    set_rule_approval_state,
    log_api_request,
    update_dispatched_claim_status,
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
from models import ClaimPacket, Rule, utc_now_iso
from pii_masker import GLOBAL_TOKEN_VAULT, PRIVACY_LIMITATION_NOTICE, build_gemini_payload
from report_generator import generate_assessment_report
from rules_engine import get_applicable_rules, get_excluded_rules_with_reasons
from sample_generator import generate_sample_pdfs


UPLOAD_DIR = Path("local_uploads")


def ensure_initialized() -> Dict[str, str]:
    init_db(DEFAULT_DB_PATH)
    sample_files = generate_sample_pdfs("sample_data")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return sample_files


def build_risk_summary(findings: List[Any], documents: List[Any], gate_ok: bool) -> Dict[str, Any]:
    """Build an explainable operational risk summary from deterministic findings."""
    pass_count = sum(1 for finding in findings if finding.status == "PASS")
    fail_findings = [finding for finding in findings if finding.status == "FAIL"]
    unresolved_review_findings = [
        finding
        for finding in findings
        if finding.status == "REVIEW" and finding.review_disposition is None
    ]
    resolved_review_count = sum(
        1 for finding in findings if finding.status == "REVIEW" and finding.review_disposition is not None
    )

    if not findings:
        return {
            "score": 0,
            "band": "NOT_RUN",
            "headline": "Run a claim audit to calculate submission risk.",
            "counts": {"pass": 0, "fail": 0, "review": 0, "resolved_review": 0},
            "top_risks": [],
            "next_actions": ["Upload at least one claim PDF and run validation."],
            "operational_impact": "No submission decision is available yet.",
            "document_count": len(documents),
        }
    penalty = (len(fail_findings) * 35) + (len(unresolved_review_findings) * 18) + (resolved_review_count * 4)
    score = max(0, min(100, 100 - penalty))
    if score >= 90 and gate_ok:
        band = "LOW"
        headline = "Submission-ready: evidence is complete and the export gate is unblocked."
        impact = "Low avoidable-query risk. The packet can proceed to gated FHIR export."
    elif score >= 65:
        band = "MEDIUM"
        headline = "Review recommended: the packet has fixable evidence uncertainty."
        impact = "Moderate query risk. Resolve reviewer items before insurer submission."
    else:
        band = "HIGH"
        headline = "Submission blocked: critical evidence gaps need action."
        impact = "High avoidable-query risk. Do not submit until blocking evidence is corrected."

    ranked_findings = sorted(
        fail_findings + unresolved_review_findings,
        key=lambda finding: (0 if finding.status == "FAIL" else 1, finding.rule_id),
    )
    top_risks = [
        {
            "status": finding.status,
            "rule_id": finding.rule_id,
            "issue": finding.issue or finding.reason,
            "reason": finding.reason,
        }
        for finding in ranked_findings[:3]
    ]

    next_actions: List[str] = []
    for finding in ranked_findings:
        action = (finding.recommended_action or finding.reason).strip()
        if action and action not in next_actions:
            next_actions.append(action)
        if len(next_actions) == 3:
            break
    if not next_actions and gate_ok:
        next_actions.append("Download the validated FHIR R4 draft bundle and complete the local gateway pre-check.")

    return {
        "score": score,
        "band": band,
        "headline": headline,
        "counts": {
            "pass": pass_count,
            "fail": len(fail_findings),
            "review": len(unresolved_review_findings),
            "resolved_review": resolved_review_count,
        },
        "top_risks": top_risks,
        "next_actions": next_actions,
        "operational_impact": impact,
        "document_count": len(documents),
    }


def build_document_completeness(
    documents: List[Any], applicable_rules: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Summarize required document evidence without treating extraction as adjudication."""
    required: List[str] = []
    for rule in applicable_rules:
        for document_type in rule.get("required_documents", []):
            if document_type not in required:
                required.append(document_type)

    received = {doc.document_type for doc in documents}
    items = [
        {
            "document_type": document_type,
            "status": "RECEIVED" if document_type in received else "MISSING",
        }
        for document_type in required
    ]
    received_count = sum(1 for item in items if item["status"] == "RECEIVED")
    return {
        "required_count": len(items),
        "received_count": received_count,
        "missing_count": len(items) - received_count,
        "items": items,
    }


def build_scan_quality(documents: List[Any]) -> Dict[str, Any]:
    """Score ingest quality only; this must never be treated as clinical validity."""
    items: List[Dict[str, Any]] = []
    for doc in documents:
        metadata = doc.source_metadata or {}
        score = round(max(0.0, min(100.0, doc.confidence * 100.0)))
        reasons: List[str] = []
        if doc.processing_mode == "digital_pdf":
            score = min(100.0, score + 5.0)
            reasons.append("Digital text layer extracted.")
        elif doc.processing_mode == "tesseract_ocr":
            ocr_confidence = metadata.get("ocr_mean_confidence")
            if isinstance(ocr_confidence, (int, float)):
                score = round(min(score, float(ocr_confidence)))
            reasons.append("Text recovered with local OCR; verify low-confidence fields.")
        else:
            score = min(score, 15.0)
            reasons.append("Text could not be reliably extracted; manual review required.")
        if metadata.get("digital_char_count", 0) == 0 and doc.processing_mode != "tesseract_ocr":
            reasons.append("No digital text was available.")
        if doc.document_type in ("ambiguous_document", "unreadable_document", "unreadable_scanned_document"):
            reasons.append("Document classification is uncertain.")
        band = "GOOD" if score >= 80 else "REVIEW" if score >= 55 else "POOR"
        items.append(
            {
                "doc_id": doc.doc_id,
                "filename": doc.filename,
                "document_type": doc.document_type,
                "score": score,
                "band": band,
                "processing_mode": doc.processing_mode,
                "page_count": doc.page_count,
                "reasons": reasons,
            }
        )
    average = round(sum(item["score"] for item in items) / len(items), 1) if items else None
    return {"average_score": average, "items": items}


def build_missing_document_recommendations(
    completeness: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Turn rule-derived missing evidence into actionable, non-adjudicative guidance."""
    labels = {
        "clinical_summary": "Clinical summary",
        "investigation_report": "Investigation or laboratory report",
        "discharge_summary": "Discharge summary",
        "itemized_estimate": "Itemized estimate",
        "final_bill": "Final bill",
        "id_proof": "Identity proof",
        "admission_note": "Admission note",
        "consultation_note": "Consultation note",
        "policy_document": "Policy schedule",
    }
    recommendations: List[Dict[str, Any]] = []
    for item in completeness["items"]:
        if item["status"] != "MISSING":
            continue
        document_type = item["document_type"]
        recommendations.append(
            {
                "document_type": document_type,
                "label": labels.get(document_type, document_type.replace("_", " ").title()),
                "priority": "HIGH",
                "reason": "This document type is required by an applicable approved rule and was not detected.",
                "accepted_document_types": [document_type],
                "action": "Upload a legible PDF for this evidence type.",
            }
        )
    return recommendations


def build_sla_priority(
    claim: Any,
    findings: List[Any],
    scan_quality: Dict[str, Any],
    missing_recommendations: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Prioritize work using persisted evidence and clearly label the workflow timer."""
    failures = sum(1 for finding in findings if finding.status == "FAIL")
    unresolved_reviews = sum(
        1 for finding in findings if finding.status == "REVIEW" and finding.review_disposition is None
    )
    poor_scans = sum(1 for item in scan_quality["items"] if item["band"] == "POOR")
    priority = "CRITICAL" if failures or poor_scans else "HIGH" if unresolved_reviews or missing_recommendations else "NORMAL"
    deadline_hours = 3 if "discharge" in claim.claim_type.lower() else 1
    tracked_from = _parse_timestamp(claim.updated_at)
    now = datetime.now(tracked_from.tzinfo) if tracked_from and tracked_from.tzinfo else datetime.now()
    elapsed_hours = ((now - tracked_from).total_seconds() / 3600.0) if tracked_from else 0.0
    is_overdue = elapsed_hours > deadline_hours
    return {
        "priority": priority,
        "deadline_hours": deadline_hours,
        "timer_basis": "last persisted claim update",
        "tracked_from": claim.updated_at,
        "is_overdue": is_overdue,
        "reason": (
            "Blocking validation findings require attention."
            if failures
            else "Low-quality scans require manual verification."
            if poor_scans
            else "Missing or uncertain evidence requires review."
            if unresolved_reviews or missing_recommendations
            else "No persisted blocker is currently recorded."
        ),
        "disclaimer": "Operational prioritization only; it is not an insurer adjudication or a legal SLA determination.",
    }


def build_integrity_signals(documents: List[Any]) -> Dict[str, Any]:
    """Surface explainable integrity signals without labeling a claim fraudulent."""
    signals: List[Dict[str, Any]] = []
    field_names = ("patient_id", "policy_id", "admission_date", "discharge_date", "total_estimated_amount")
    for field_name in field_names:
        values: Dict[str, List[str]] = defaultdict(list)
        for doc in documents:
            field = doc.extracted_fields.get(field_name)
            if field and field.is_known and field.value:
                values[str(field.value)].append(doc.filename)
        if len(values) > 1:
            signals.append(
                {
                    "type": "cross_document_conflict",
                    "severity": "HIGH",
                    "field": field_name,
                    "message": f"Different {field_name.replace('_', ' ')} values were extracted across documents.",
                    "evidence": [{"value": value, "documents": files} for value, files in values.items()],
                    "disposition": "Review source documents before submission.",
                }
            )
    seen_hashes: Dict[str, List[str]] = defaultdict(list)
    for doc in documents:
        if doc.file_sha256:
            seen_hashes[doc.file_sha256].append(doc.filename)
    for file_hash, filenames in seen_hashes.items():
        if len(filenames) > 1:
            signals.append(
                {
                    "type": "duplicate_document",
                    "severity": "MEDIUM",
                    "field": "file_sha256",
                    "message": "The same file content appears more than once in this claim packet.",
                    "evidence": [{"sha256": file_hash, "documents": filenames}],
                    "disposition": "Confirm whether the duplicate upload is intentional.",
                }
            )
    return {
        "status": "REVIEW_SIGNALS" if signals else "NO_SIGNALS",
        "signals": signals,
        "disclaimer": "These are explainable integrity signals, not a fraud finding or payment decision.",
    }


def build_policy_copilot(
    claim: Any,
    applicable_rules: List[Any],
    missing_recommendations: List[Dict[str, Any]],
    findings: List[Any],
) -> Dict[str, Any]:
    """Provide a cited answer from approved local rules only; never invent coverage terms."""
    blockers = [finding for finding in findings if finding.status != "PASS"]
    if blockers:
        answer = (
            f"{len(blockers)} rule check(s) are not PASS. Resolve the cited evidence issues before relying "
            "on the packet for export."
        )
    elif missing_recommendations:
        answer = "The packet is missing evidence required by the applicable approved rule set."
    else:
        answer = "No non-PASS rule checks are persisted for this claim. This is a readiness assessment, not adjudication."
    return {
        "question": "What policy evidence is driving this claim assessment?",
        "answer": answer,
        "scope": "Approved local synthetic rules only",
        "citations": [
            {
                "rule_id": rule.rule_id,
                "description": rule.description,
                "source_reference": rule.source_reference,
            }
            for rule in applicable_rules
        ],
        "disclaimer": "Policy copilot answers are constrained to cited local rules and do not replace insurer or clinical review.",
    }


def _parse_timestamp(value: str) -> datetime | None:
    """Parse persisted ISO timestamps without making the dashboard depend on a locale."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError):
        return None


def build_operations_summary(claims: List[Any]) -> Dict[str, Any]:
    """Build Command Center data from persisted records only.

    This deliberately avoids estimated trends and fabricated workflow numbers.  A claim
    is counted as needing attention only when its latest persisted findings block the
    FHIR gate or require an unresolved human disposition.
    """
    pipeline = Counter()
    priority_queue: List[Dict[str, Any]] = []
    verification_days: Dict[str, Dict[str, int]] = defaultdict(lambda: {"total": 0, "clear": 0, "exception": 0})
    tool_counts = Counter()
    durations: List[float] = []

    for claim in claims:
        findings = get_findings(claim.claim_id, DEFAULT_DB_PATH)
        traces_for_claim = get_tool_traces(claim.claim_id, DEFAULT_DB_PATH)
        gate_ok, _ = check_fhir_gate(findings) if findings else (False, [])
        unresolved_reviews = sum(
            1 for finding in findings if finding.status == "REVIEW" and finding.review_disposition is None
        )
        failures = sum(1 for finding in findings if finding.status == "FAIL")

        if gate_ok:
            pipeline["completed"] += 1
        elif unresolved_reviews:
            pipeline["review"] += 1
        elif failures:
            pipeline["exception"] += 1
        elif claim.status == "DRAFT":
            pipeline["draft"] += 1
        else:
            pipeline["queued"] += 1

        for trace in traces_for_claim:
            tool_counts[trace.tool] += 1
        trace_times = [parsed for trace in traces_for_claim if (parsed := _parse_timestamp(trace.timestamp))]
        if len(trace_times) >= 2:
            durations.append(max(0, (max(trace_times) - min(trace_times)).total_seconds()))

        audit_events = [event for event in list_audit_logs(claim_id=claim.claim_id, db_path=DEFAULT_DB_PATH) if event.action == "PIPELINE_EXECUTED"]
        for event in audit_events:
            day = (event.timestamp or "")[:10]
            if not day:
                continue
            verification_days[day]["total"] += 1
            if gate_ok:
                verification_days[day]["clear"] += 1
            else:
                verification_days[day]["exception"] += 1

        if findings and not gate_ok:
            summary = build_risk_summary(findings, get_claim_documents(claim.claim_id, DEFAULT_DB_PATH), gate_ok)
            top = summary["top_risks"][0] if summary["top_risks"] else None
            priority_queue.append(
                {
                    "claim_id": claim.claim_id,
                    "amount": claim.estimated_amount,
                    "status": "Needs review" if unresolved_reviews else "Evidence gap",
                    "reason": top["issue"] if top else "Verification remains incomplete.",
                    "next_action": summary["next_actions"][0] if summary["next_actions"] else "Open the verification record.",
                    "updated_at": claim.updated_at,
                    "severity": "HIGH" if failures else "MEDIUM",
                }
            )

    priority_queue.sort(key=lambda item: (0 if item["severity"] == "HIGH" else 1, item["updated_at"]), reverse=False)
    recent_activity = [event.to_dict() for event in list_audit_logs(db_path=DEFAULT_DB_PATH)[:12]]
    volume = [
        {"date": day, **counts}
        for day, counts in sorted(verification_days.items())[-14:]
    ]

    return {
        "metrics": {
            "total_claims": len(claims),
            "under_verification": pipeline["queued"] + pipeline["draft"],
            "completed_verifications": pipeline["completed"],
            "requires_review": pipeline["review"] + pipeline["exception"],
            "failed_execution_runs": 0,
            "average_verification_seconds": round(sum(durations) / len(durations), 2) if durations else None,
        },
        "pipeline": {
            "submitted": len(claims),
            "queued": pipeline["queued"] + pipeline["draft"],
            "completed": pipeline["completed"],
            "review": pipeline["review"] + pipeline["exception"],
            "closed": 0,
        },
        "priority_queue": priority_queue[:8],
        "recent_activity": recent_activity,
        "verification_volume": volume,
        "stage_execution_counts": dict(sorted(tool_counts.items())),
        "data_note": "All metrics are calculated from local synthetic demonstration records.",
    }


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
    applicable_rule_objects: List[Any] = []
    excluded_rules = []
    outbound_preview = None
    if active_claim:
        applicable_rule_objects = get_applicable_rules(
            insurer=active_claim.insurer,
            policy_code=active_claim.policy_code,
            claim_type=active_claim.claim_type,
            relevant_date=active_claim.relevant_date,
            diagnosis=active_claim.diagnosis,
            db_path=DEFAULT_DB_PATH,
        )
        applicable_rules = [
            r.to_dict()
            for r in applicable_rule_objects
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

    scan_quality = build_scan_quality(docs)
    missing_recommendations = build_missing_document_recommendations(
        build_document_completeness(docs, applicable_rules)
    )
    sla_priority = (
        build_sla_priority(active_claim, findings, scan_quality, missing_recommendations)
        if active_claim
        else None
    )
    integrity_signals = build_integrity_signals(docs)
    policy_copilot = (
        build_policy_copilot(active_claim, applicable_rule_objects, missing_recommendations, findings)
        if active_claim
        else None
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
        "operations": build_operations_summary(claims),
        "active_claim": active_claim.to_dict() if active_claim else None,
        "documents": [d.to_dict() for d in docs],
        "applicable_rules": applicable_rules,
        "excluded_rules": excluded_rules,
        "document_completeness": build_document_completeness(docs, applicable_rules),
        "missing_document_recommendations": missing_recommendations,
        "scan_quality": scan_quality,
        "sla_priority": sla_priority,
        "integrity_signals": integrity_signals,
        "policy_copilot": policy_copilot,
        "outbound_preview": outbound_preview,
        "findings": [f.to_dict() for f in findings],
        "traces": [t.to_dict() for t in traces],
        "rules": [r.to_dict() for r in list_rules(latest_only=False, db_path=DEFAULT_DB_PATH)],
        "audit_logs": [a.to_dict() for a in list_audit_logs(claim_id=active_claim_id, db_path=DEFAULT_DB_PATH)[:40]],
        "gate": {
            "allowed": gate_ok,
            "blocking_reasons": blocking_reasons,
        },
        "risk_summary": build_risk_summary(findings, docs, gate_ok),
        "fhir_bundle": fhir_bundle,
        "fhir_validation": fhir_validation,
    }


INSURER_ID_MAP = {
    "INS-DEMO-01": "Fictional Insurer A",
    "INS-DEMO-02": "Fictional Insurer B",
}


def _resolve_api_insurer(insurer_id: str, policy_type: str) -> str:
    if insurer_id in INSURER_ID_MAP:
        return INSURER_ID_MAP[insurer_id]
    if insurer_id in {"Fictional Insurer A", "Fictional Insurer B"}:
        return insurer_id
    if policy_type.upper().startswith("A"):
        return "Fictional Insurer A"
    if policy_type.upper().startswith("B"):
        return "Fictional Insurer B"
    raise ValueError("insurer_id is unsupported. Use INS-DEMO-01, INS-DEMO-02, or a configured insurer name.")


def _api_sla_target(claim_type: str) -> str:
    return "03h 00m Final Discharge" if claim_type == "Final Discharge" else "01h 00m Cashless Pre-Auth"


def _api_missing_documents(findings: List[Any]) -> List[Dict[str, str]]:
    missing: List[Dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for finding in findings:
        if finding.status == "PASS":
            continue
        item = (
            finding.rule_id,
            finding.issue or finding.reason,
        )
        if item in seen:
            continue
        seen.add(item)
        missing.append(
            {
                "rule_id": finding.rule_id,
                "document_name": finding.issue or finding.reason,
                "severity": finding.status,
                "remediation": finding.recommended_action or finding.reason,
            }
        )
    return missing


def _api_masking_summary(claim_id: str) -> Dict[str, Any]:
    category_counts = GLOBAL_TOKEN_VAULT.get_category_counts(claim_id)
    entity_map = {
        "PERSON": "PATIENT_NAME",
        "PATIENT_NAME": "PATIENT_NAME",
        "PHONE": "PHONE_NUMBER",
        "PATIENT_ID": "PATIENT_ID",
        "AADHAAR": "GOV_ID",
        "PAN": "GOV_ID",
        "POLICY_ID": "POLICY_ID",
        "DOB": "DATE_OF_BIRTH",
        "EMAIL": "EMAIL",
        "ADDRESS": "ADDRESS",
    }
    entities: List[str] = []
    for category, count in category_counts.items():
        if count and entity_map.get(category) and entity_map[category] not in entities:
            entities.append(entity_map[category])
    return {
        "dpdp_compliant": False,
        "local_masking_applied": True,
        "entities_redacted": sorted(entities),
        "notice": PRIVACY_LIMITATION_NOTICE,
    }


def execute_api_audit_claim(args: Dict[str, Any]) -> Dict[str, Any]:
    hospital_claim_ref = str(args.get("hospital_claim_ref") or "").strip()
    insurer_id = str(args.get("insurer_id") or "").strip()
    policy_type = str(args.get("policy_type") or "").strip().upper()
    claim_type = str(args.get("claim_type") or "").strip()
    diagnosis_icd10 = str(args.get("diagnosis_icd10") or "").strip().upper()
    if not hospital_claim_ref or not insurer_id or not policy_type or not diagnosis_icd10:
        raise ValueError("hospital_claim_ref, insurer_id, policy_type, and diagnosis_icd10 are required.")
    if claim_type not in {"Cashless Pre-Auth", "Final Discharge"}:
        raise ValueError("claim_type must be 'Cashless Pre-Auth' or 'Final Discharge'.")
    if policy_type not in {"A1", "A2", "B1", "B2"}:
        raise ValueError("policy_type must be one of A1, A2, B1, or B2.")

    insurer = _resolve_api_insurer(insurer_id, policy_type)
    internal_claim_id = f"API-{uuid.uuid4().hex[:16].upper()}"
    claim_dir = UPLOAD_DIR / "api" / internal_claim_id
    claim_dir.mkdir(parents=True, exist_ok=True)
    pdf_paths: List[str] = []
    documents = args.get("documents") or args.get("extracted_documents") or []
    if not isinstance(documents, list) or not documents:
        raise ValueError("At least one PDF document is required in documents or extracted_documents.")

    for index, document in enumerate(documents):
        if not isinstance(document, dict):
            raise ValueError("Each document must be an object containing filename and base64.")
        filename = Path(str(document.get("filename") or f"document-{index + 1}.pdf")).name
        encoded = document.get("base64")
        if not isinstance(encoded, str) or not encoded:
            raise ValueError(f"Document {filename} must contain a base64 PDF payload.")
        try:
            raw_bytes = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Document {filename} is not valid base64.") from exc
        destination = claim_dir / filename
        destination.write_bytes(raw_bytes)
        pdf_paths.append(str(destination))

    claim = ClaimPacket(
        claim_id=internal_claim_id,
        insurer=insurer,
        policy_code=policy_type,
        claim_type=claim_type,
        relevant_date=str(args.get("relevant_date") or "2026-10-10"),
        diagnosis=f"{diagnosis_icd10} ({'Dengue Fever' if diagnosis_icd10 == 'A90' else diagnosis_icd10})",
        care_setting="inpatient",
        patient_reference=hospital_claim_ref,
        status="PROCESSING",
    )
    orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH, force_fallback=True)
    orch.execute_claim_pipeline(
        claim,
        pdf_paths=pdf_paths,
        preserve_dispositions=False,
        attempt_fhir_if_ready=True,
        replace_documents=True,
    )
    docs = get_claim_documents(internal_claim_id, DEFAULT_DB_PATH)
    findings = get_findings(internal_claim_id, DEFAULT_DB_PATH)
    gate_ok, _ = check_fhir_gate(findings)
    fhir_bundle = build_fhir_r4_bundle(claim, docs, findings) if gate_ok else None
    if fhir_bundle:
        fhir_bundle = fhir_bundle.get("bundle", fhir_bundle)

    result = {
        "audit_id": f"CK-AUD-{utc_now_iso()[:4]}-{uuid.uuid4().hex[:8].upper()}",
        "hospital_name": str(args.get("_hospital_name") or ""),
        "hospital_claim_ref": hospital_claim_ref,
        "status": "PASS" if gate_ok else "BLOCKED",
        "irdai_sla_target": _api_sla_target(claim_type),
        "summary": {
            "total_rules_checked": len(findings),
            "passed": sum(1 for finding in findings if finding.status == "PASS"),
            "failed": sum(1 for finding in findings if finding.status == "FAIL"),
        },
        "missing_documents": _api_missing_documents(findings),
        "pii_masking": _api_masking_summary(internal_claim_id),
        "nhcx_gateway_ready": gate_ok,
        "fhir_r4_bundle": fhir_bundle,
    }
    return result


def main() -> None:
    action = sys.argv[1] if len(sys.argv) > 1 else "state"
    raw_args = sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read() or "{}"
    args = json.loads(raw_args)

    try:
        sample_files = ensure_initialized()
        if action == "state":
            out = build_state_payload(args.get("claim_id"))
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "generate_api_key":
            out = create_api_key(
                hospital_name=str(args.get("hospital_name") or ""),
                hms_provider=str(args.get("hms_provider") or ""),
                environment=str(args.get("environment") or ""),
                db_path=DEFAULT_DB_PATH,
            )
            print(json.dumps({"ok": True, "data": out}))
            return

        if action == "list_api_keys":
            print(json.dumps({"ok": True, "data": list_api_keys(DEFAULT_DB_PATH)}))
            return

        if action == "get_demo_api_key":
            print(json.dumps({"ok": True, "data": get_demo_api_key(DEFAULT_DB_PATH)}))
            return

        if action == "list_insurers":
            print(json.dumps({"ok": True, "data": list_insurers(DEFAULT_DB_PATH)}))
            return

        if action == "list_insurer_policies":
            print(json.dumps({"ok": True, "data": list_insurer_policies(
                str(args.get("insurer_id") or ""),
                DEFAULT_DB_PATH,
            )}))
            return

        if action == "authenticate_insurer":
            identity = authenticate_insurer(
                str(args.get("email") or ""),
                str(args.get("password") or ""),
                DEFAULT_DB_PATH,
            )
            print(json.dumps({"ok": bool(identity), "data": identity}))
            return

        if action == "register_insurer":
            print(json.dumps({"ok": True, "data": create_insurer(
                company_name=str(args.get("company_name") or ""),
                insurer_code=str(args.get("insurer_code") or ""),
                email=str(args.get("email") or ""),
                password=str(args.get("password") or ""),
                db_path=DEFAULT_DB_PATH,
            )}))
            return

        if action == "create_insurer_rule":
            print(json.dumps({"ok": True, "data": create_insurer_rule(
                insurer_id=str(args.get("insurer_id") or ""),
                policy_name=str(args.get("policy_name") or ""),
                condition=str(args.get("condition") or ""),
                claim_type=str(args.get("claim_type") or ""),
                required_documents=[str(item) for item in (args.get("required_documents") or [])],
                db_path=DEFAULT_DB_PATH,
            )}))
            return

        if action == "dispatch_claim":
            print(json.dumps({"ok": True, "data": create_dispatched_claim(args, DEFAULT_DB_PATH)}))
            return

        if action == "list_dispatched_claims":
            insurer_id = str(args.get("insurer_id") or "").strip() or None
            print(json.dumps({"ok": True, "data": list_dispatched_claims(insurer_id, DEFAULT_DB_PATH)}))
            return

        if action == "update_dispatched_claim_status":
            print(json.dumps({"ok": True, "data": update_dispatched_claim_status(
                str(args.get("claim_id") or ""),
                str(args.get("payer_status") or ""),
                DEFAULT_DB_PATH,
            )}))
            return

        if action == "revoke_api_key":
            key_id = str(args.get("id") or "")
            if not key_id or not revoke_api_key(key_id, DEFAULT_DB_PATH):
                raise ValueError("API key was not found.")
            print(json.dumps({"ok": True, "data": {"id": key_id, "status": "revoked"}}))
            return

        if action == "authenticate_api_key":
            token = str(args.get("token") or "")
            identity = authenticate_api_key(token, DEFAULT_DB_PATH)
            print(json.dumps({"ok": bool(identity), "data": identity}))
            return

        if action == "log_api_request":
            log_api_request(
                api_key_id=str(args.get("api_key_id") or ""),
                endpoint=str(args.get("endpoint") or ""),
                insurer_id=str(args.get("insurer_id") or ""),
                diagnosis_code=str(args.get("diagnosis_code") or ""),
                verdict=str(args.get("verdict") or ""),
                latency_ms=int(args.get("latency_ms") or 0),
                db_path=DEFAULT_DB_PATH,
            )
            print(json.dumps({"ok": True}))
            return

        if action == "audit_claim":
            print(json.dumps({"ok": True, "data": execute_api_audit_claim(args)}))
            return

        if action == "process_claim":
            claim_id = (args.get("claim_id") or "CLM-USER-101").strip()
            insurer = args.get("insurer", "Fictional Insurer A")
            policy_code = args.get("policy_code", "A1")
            claim_type = args.get("claim_type", "Inpatient Cashless")
            relevant_date = args.get("relevant_date", "2026-10-10")
            diagnosis = args.get("diagnosis", "").strip()
            estimated_amount = str(args.get("estimated_amount", "")).strip()
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
                estimated_amount=estimated_amount,
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
            if "estimated_amount" in args:
                claim.estimated_amount = str(args["estimated_amount"]).strip()
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

        if action == "generate_report":
            claim_id = args["claim_id"]
            claim = get_claim(claim_id, DEFAULT_DB_PATH)
            if not claim:
                raise ValueError(f"Claim {claim_id} not found.")
            docs = get_claim_documents(claim_id, DEFAULT_DB_PATH)
            findings = get_findings(claim_id, DEFAULT_DB_PATH)
            gate_ok, blocking_reasons = check_fhir_gate(findings)
            report_path = generate_assessment_report(
                claim=claim,
                documents=docs,
                findings=findings,
                risk_summary=build_risk_summary(findings, docs, gate_ok),
                gate_allowed=gate_ok,
                blocking_reasons=blocking_reasons,
            )
            print(json.dumps({"ok": True, "claim_id": claim_id, "filename": report_path.name}))
            return

        raise ValueError(f"Unknown action: {action}")
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))


if __name__ == "__main__":
    main()
