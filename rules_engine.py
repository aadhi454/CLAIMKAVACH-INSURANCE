"""Deterministic rule retrieval, condition matching, evidence validation, and cross-document consistency engine."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple
import uuid

from database import DEFAULT_DB_PATH, list_rules
from models import (
    ClaimPacket,
    ExtractedDoc,
    ProvenanceField,
    RequirementSpec,
    Rule,
    ValidationFinding,
    utc_now_iso,
)


CONSISTENCY_CHECK_FIELDS = [
    "patient_id",
    "patient_name",
    "policy_id",
    "admission_date",
    "discharge_date",
    "primary_diagnosis",
]


def _normalize_policy_code(policy_code: Optional[str]) -> str:
    if not policy_code:
        return "*"
    cleaned = policy_code.strip()
    if cleaned.lower().startswith("policy "):
        cleaned = cleaned[7:].strip()
    return cleaned


def get_applicable_rules(
    insurer: str,
    policy_code: str,
    claim_type: str,
    relevant_date: str,
    diagnosis: str = "",
    db_path: str = DEFAULT_DB_PATH,
) -> List[Rule]:
    """Retrieve only approved, effective, applicable rules for the latest rule version."""
    latest_rules = list_rules(latest_only=True, db_path=db_path)
    norm_pol = _normalize_policy_code(policy_code)
    diag_lower = (diagnosis or "").strip().lower()

    applicable: List[Rule] = []
    for r in latest_rules:
        if r.approval_state != "APPROVED":
            continue
        if r.insurer not in ("*", insurer):
            continue
        r_pol = _normalize_policy_code(r.policy_code)
        if r_pol not in ("*", norm_pol):
            continue
        if r.claim_type not in ("*", claim_type):
            continue
        if not (r.effective_start <= relevant_date <= r.effective_end):
            continue

        # Condition-specific rules: only include if diagnosis keyword matches (or when diagnosis is provided)
        if r.conditions:
            if not diag_lower:
                # If caller did not specify a diagnosis, skip condition-specific rules unless evaluating diagnosis
                continue
            if not any(kw.lower() in diag_lower for kw in r.conditions):
                continue

        applicable.append(r)
    return applicable


def get_excluded_rules_with_reasons(
    insurer: str,
    policy_code: str,
    claim_type: str,
    relevant_date: str,
    diagnosis: str = "",
    db_path: str = DEFAULT_DB_PATH,
) -> List[Dict[str, Any]]:
    """Return rules that were excluded from execution along with the exact reason."""
    latest_rules = list_rules(latest_only=True, db_path=db_path)
    norm_pol = _normalize_policy_code(policy_code)
    diag_lower = (diagnosis or "").strip().lower()
    excluded: List[Dict[str, Any]] = []

    for r in latest_rules:
        reasons: List[str] = []
        if r.approval_state != "APPROVED":
            reasons.append(f"Approval state is {r.approval_state} (not APPROVED)")
        if r.insurer not in ("*", insurer):
            reasons.append(f"Insurer mismatch ({r.insurer} vs {insurer})")
        r_pol = _normalize_policy_code(r.policy_code)
        if r_pol not in ("*", norm_pol):
            reasons.append(f"Policy mismatch ({r_pol} vs {norm_pol})")
        if r.claim_type not in ("*", claim_type):
            reasons.append(f"Claim type mismatch ({r.claim_type} vs {claim_type})")
        if not (r.effective_start <= relevant_date <= r.effective_end):
            reasons.append(f"Relevant date {relevant_date} outside effective window ({r.effective_start}..{r.effective_end})")
        if r.conditions:
            if not diag_lower:
                reasons.append(f"Condition rule requires diagnosis matching {r.conditions}")
            elif not any(kw.lower() in diag_lower for kw in r.conditions):
                reasons.append(f"Diagnosis '{diagnosis}' does not match keywords {r.conditions}")

        if reasons:
            excluded.append(
                {
                    "rule_id": r.rule_id,
                    "version": r.version,
                    "insurer": r.insurer,
                    "policy_code": r.policy_code,
                    "approval_state": r.approval_state,
                    "reasons": reasons,
                }
            )
    return excluded


def _collect_field_occurrences(
    docs: List[ExtractedDoc],
    field_name: str,
) -> List[Tuple[ExtractedDoc, ProvenanceField]]:
    occurrences: List[Tuple[ExtractedDoc, ProvenanceField]] = []
    for doc in docs:
        pf = (doc.extracted_fields or doc.fields).get(field_name)
        if pf and pf.is_known and pf.value is not None and str(pf.value).strip():
            occurrences.append((doc, pf))
    return occurrences


def _evaluate_requirement_spec(
    claim: ClaimPacket,
    docs: List[ExtractedDoc],
    rule: Rule,
    req: RequirementSpec,
) -> ValidationFinding:
    """Evaluate a structured RequirementSpec against the uploaded documents."""
    now = utc_now_iso()
    matching_docs = [
        d for d in docs if (not req.accepted_doc_types or d.document_type in req.accepted_doc_types)
    ]

    if not matching_docs:
        status = "FAIL" if rule.severity.lower() in ("critical", "required") else "REVIEW"
        return ValidationFinding(
            finding_id=f"FND-{uuid.uuid4().hex[:8]}",
            claim_id=claim.claim_id,
            status=status,
            evidence_state="MISSING",
            rule_id=rule.rule_id,
            rule_version=rule.version,
            source_reference=rule.source_reference,
            check_type="REQUIRED_DOCUMENT",
            issue=f"Missing {req.label}",
            reason=f"Required evidence not found in uploaded packet. Missing: {req.label} (expected document type: {', '.join(req.accepted_doc_types)}).",
            recommended_action=f"Upload a readable {req.label} PDF and rerun validation.",
            evidence_references=[],
            created_at=now,
        )

    # Check if any matching doc satisfies content_patterns and result_patterns without pending_patterns
    for doc in matching_docs:
        page_text = "\n".join((doc.source_metadata.get("page_previews") or {}).values())
        lower_text = page_text.lower()
        excerpt = page_text[:200].replace("\n", " ")

        # Check pending/awaited patterns first
        if req.pending_patterns and any(p.lower() in lower_text for p in req.pending_patterns):
            return ValidationFinding(
                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                claim_id=claim.claim_id,
                status="REVIEW",
                evidence_state="UNCERTAIN",
                rule_id=rule.rule_id,
                rule_version=rule.version,
                source_reference=rule.source_reference,
                check_type="REQUIRED_DOCUMENT",
                issue=f"Pending / awaited result in {doc.filename} for {req.label}",
                reason=(
                    f"Document '{doc.filename}' for '{req.label}' indicates result is pending or awaited. "
                    f"Human review or final laboratory report is required."
                ),
                recommended_action=f"Upload finalized report for {req.label} or record reviewer disposition.",
                evidence_references=[
                    {
                        "source_document": doc.filename,
                        "page": 1,
                        "evidence_excerpt": excerpt,
                        "field_name": req.evidence_key,
                        "value": "pending_or_awaited",
                    }
                ],
                created_at=now,
            )

        if req.require_itemized and "line_items_summary" not in (doc.extracted_fields or doc.fields):
            return ValidationFinding(
                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                claim_id=claim.claim_id,
                status="REVIEW",
                evidence_state="UNCERTAIN",
                rule_id=rule.rule_id,
                rule_version=rule.version,
                source_reference=rule.source_reference,
                check_type="REQUIRED_DOCUMENT",
                issue=f"Lump-sum or non-itemized estimate in {doc.filename}",
                reason=f"Document '{doc.filename}' was uploaded for '{req.label}', but itemized line items with amounts were not detected.",
                recommended_action="Upload an itemized estimate showing line-item breakdown or confirm in human review.",
                evidence_references=[
                    {
                        "source_document": doc.filename,
                        "page": 1,
                        "evidence_excerpt": excerpt,
                        "field_name": req.evidence_key,
                        "value": "lump_sum_uncertain",
                    }
                ],
                created_at=now,
            )

        if req.content_patterns and not any(re.search(pat, lower_text, re.IGNORECASE) for pat in req.content_patterns):
            continue

        if req.result_patterns and not any(re.search(pat, lower_text, re.IGNORECASE) for pat in req.result_patterns):
            return ValidationFinding(
                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                claim_id=claim.claim_id,
                status="REVIEW",
                evidence_state="UNCERTAIN",
                rule_id=rule.rule_id,
                rule_version=rule.version,
                source_reference=rule.source_reference,
                check_type="REQUIRED_DOCUMENT",
                issue=f"Test mentioned without confirmed result for {req.label}",
                reason=f"Document '{doc.filename}' mentions '{req.label}', but a clear test result value was not confirmed.",
                recommended_action="Confirm test result in Document Inspector or upload complete report.",
                evidence_references=[
                    {
                        "source_document": doc.filename,
                        "page": 1,
                        "evidence_excerpt": excerpt,
                        "field_name": req.evidence_key,
                        "value": "result_uncertain",
                    }
                ],
                created_at=now,
            )

        if doc.confidence < req.min_confidence or doc.processing_mode in ("ocr_unavailable_fallback", "ocr_unavailable", "unreadable"):
            return ValidationFinding(
                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                claim_id=claim.claim_id,
                status="REVIEW",
                evidence_state="UNCERTAIN",
                rule_id=rule.rule_id,
                rule_version=rule.version,
                source_reference=rule.source_reference,
                check_type="REQUIRED_DOCUMENT",
                issue=f"Low confidence on {doc.filename} for {req.label}",
                reason=f"Document '{doc.filename}' for '{req.label}' has low extraction confidence ({doc.confidence:.2f}) and requires human verification.",
                recommended_action="Inspect document text and record human reviewer disposition.",
                evidence_references=[
                    {
                        "source_document": doc.filename,
                        "page": 1,
                        "evidence_excerpt": excerpt,
                        "field_name": req.evidence_key,
                        "value": str(doc.confidence),
                    }
                ],
                created_at=now,
            )

        return ValidationFinding(
            finding_id=f"FND-{uuid.uuid4().hex[:8]}",
            claim_id=claim.claim_id,
            status="PASS",
            evidence_state="PRESENT",
            rule_id=rule.rule_id,
            rule_version=rule.version,
            source_reference=rule.source_reference,
            check_type="REQUIRED_DOCUMENT",
            issue=f"Verified {req.label}",
            reason=f"Requirement '{req.label}' is satisfied by '{doc.filename}'.",
            recommended_action="No action needed.",
            evidence_references=[
                {
                    "source_document": doc.filename,
                    "page": 1,
                    "evidence_excerpt": excerpt,
                    "field_name": req.evidence_key,
                    "value": doc.document_type,
                }
            ],
            created_at=now,
        )

    status = "FAIL" if rule.severity.lower() in ("critical", "required") else "REVIEW"
    return ValidationFinding(
        finding_id=f"FND-{uuid.uuid4().hex[:8]}",
        claim_id=claim.claim_id,
        status=status,
        evidence_state="MISSING",
        rule_id=rule.rule_id,
        rule_version=rule.version,
        source_reference=rule.source_reference,
        check_type="REQUIRED_DOCUMENT",
        issue=f"Missing {req.label}",
        reason=f"Required evidence not found in uploaded packet. Missing: {req.label}.",
        recommended_action=f"Upload {req.label} PDF and rerun validation.",
        evidence_references=[],
        created_at=now,
    )


def validate_claim_evidence(
    claim: ClaimPacket,
    docs: List[ExtractedDoc],
    applicable_rules: List[Rule],
    db_path: str = DEFAULT_DB_PATH,
) -> List[ValidationFinding]:
    """Run deterministic required-document, required-field, and document-readability checks."""
    findings: List[ValidationFinding] = []
    now = utc_now_iso()

    # If no documents are uploaded at all, emit a clear FAIL finding
    if not docs:
        findings.append(
            ValidationFinding(
                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                claim_id=claim.claim_id,
                status="FAIL",
                evidence_state="MISSING",
                rule_id="PACKET-EMPTY-CHECK",
                rule_version=1,
                source_reference="SYNTH-PACKET-EMPTY (SYNTHETIC DEMO DATA)",
                check_type="REQUIRED_DOCUMENT",
                issue="No documents uploaded in claim packet",
                reason="Required evidence not found in uploaded packet. Zero PDF documents have been uploaded.",
                recommended_action="Upload your claim PDF documents and click Validate.",
                evidence_references=[],
                created_at=now,
            )
        )
        return findings

    # 1. Check document readability / ambiguous documents first
    for doc in docs:
        if doc.processing_mode in ("ocr_unavailable_fallback", "ocr_unavailable", "unreadable") or doc.document_type.startswith("unreadable"):
            findings.append(
                ValidationFinding(
                    finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                    claim_id=claim.claim_id,
                    status="REVIEW",
                    evidence_state="UNCERTAIN",
                    rule_id="DOC-READABILITY-CHECK",
                    rule_version=1,
                    source_reference="SYNTH-DOC-READABILITY (SYNTHETIC DEMO DATA)",
                    check_type="DOCUMENT_QUALITY",
                    issue=f"Unreadable or OCR-unavailable document: {doc.filename}",
                    reason=(
                        f"Uploaded document '{doc.filename}' could not be reliably read "
                        f"(mode: {doc.processing_mode}). {doc.source_metadata.get('status_note', '')}"
                    ).strip(),
                    recommended_action="Inspect original PDF and record human disposition or upload a clear digital PDF.",
                    evidence_references=[
                        {
                            "source_document": doc.filename,
                            "page": 1,
                            "evidence_excerpt": doc.source_metadata.get("status_note", "Unreadable or scanned page without OCR"),
                            "field_name": "document_readability",
                            "value": doc.processing_mode,
                        }
                    ],
                    created_at=now,
                )
            )
        elif doc.document_type == "ambiguous_document" or doc.confidence < 0.70:
            findings.append(
                ValidationFinding(
                    finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                    claim_id=claim.claim_id,
                    status="REVIEW",
                    evidence_state="UNCERTAIN",
                    rule_id="DOC-AMBIGUITY-CHECK",
                    rule_version=1,
                    source_reference="SYNTH-DOC-CONFIDENCE (SYNTHETIC DEMO DATA)",
                    check_type="DOCUMENT_QUALITY",
                    issue=f"Low-confidence or ambiguous document: {doc.filename}",
                    reason=(
                        f"Uploaded document '{doc.filename}' has low confidence ({doc.confidence:.2f}) "
                        f"or pending/ambiguous markers requiring human verification."
                    ),
                    recommended_action="Inspect document text and record a reasoned human disposition.",
                    evidence_references=[
                        {
                            "source_document": doc.filename,
                            "page": 1,
                            "evidence_excerpt": doc.source_metadata.get("page_previews", {}).get("1", "")[:220],
                            "field_name": "document_confidence",
                            "value": str(doc.confidence),
                        }
                    ],
                    created_at=now,
                )
            )

    # Check if diagnosis was entered but no condition-specific rule matched under the chosen policy (e.g. Insurer B Policy B2 Dengue)
    if claim.diagnosis and claim.diagnosis.strip():
        has_condition_rule = any(bool(r.conditions) for r in applicable_rules)
        if not has_condition_rule:
            findings.append(
                ValidationFinding(
                    finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                    claim_id=claim.claim_id,
                    status="REVIEW",
                    evidence_state="UNCERTAIN",
                    rule_id="RULE-APPLICABILITY-UNCERTAIN",
                    rule_version=1,
                    source_reference="SYNTH-APPLICABILITY-POLICY (SYNTHETIC DEMO DATA)",
                    check_type="APPLICABILITY",
                    issue=f"No approved condition-specific rule for '{claim.diagnosis}' under {claim.insurer} ({claim.policy_code})",
                    reason=(
                        f"No approved condition-specific rule found for diagnosis '{claim.diagnosis}' under "
                        f"{claim.insurer} / {claim.policy_code}; applicability uncertain."
                    ),
                    recommended_action="Review policy applicability manually and record a human disposition.",
                    evidence_references=[],
                    created_at=now,
                )
            )

    # 2. Evaluate each applicable rule
    for rule in applicable_rules:
        # If the rule defines detailed RequirementSpec objects, evaluate them
        if rule.requirements:
            for req_spec in rule.requirements:
                findings.append(_evaluate_requirement_spec(claim, docs, rule, req_spec))
        else:
            # Evaluate required_documents list
            for req_doc_type in rule.required_documents:
                matching_docs = [d for d in docs if d.document_type == req_doc_type]
                if matching_docs:
                    best_doc = max(matching_docs, key=lambda d: d.confidence)
                    preview_excerpt = (
                        best_doc.source_metadata.get("page_previews", {}).get("1", f"Document {best_doc.filename}")[:180]
                    )
                    if best_doc.confidence >= 0.70 and best_doc.processing_mode not in ("ocr_unavailable_fallback", "ocr_unavailable", "unreadable"):
                        findings.append(
                            ValidationFinding(
                                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                                claim_id=claim.claim_id,
                                status="PASS",
                                evidence_state="PRESENT",
                                rule_id=rule.rule_id,
                                rule_version=rule.version,
                                source_reference=rule.source_reference,
                                check_type="REQUIRED_DOCUMENT",
                                issue=f"Present: {req_doc_type}",
                                reason=f"Required document '{req_doc_type}' is present in the uploaded packet ({best_doc.filename}).",
                                recommended_action="No action needed.",
                                evidence_references=[
                                    {
                                        "source_document": best_doc.filename,
                                        "page": 1,
                                        "evidence_excerpt": preview_excerpt,
                                        "field_name": "document_type",
                                        "value": req_doc_type,
                                    }
                                ],
                                created_at=now,
                            )
                        )
                    else:
                        findings.append(
                            ValidationFinding(
                                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                                claim_id=claim.claim_id,
                                status="REVIEW",
                                evidence_state="UNCERTAIN",
                                rule_id=rule.rule_id,
                                rule_version=rule.version,
                                source_reference=rule.source_reference,
                                check_type="REQUIRED_DOCUMENT",
                                issue=f"Low-confidence document for {req_doc_type}",
                                reason=(
                                    f"Required document '{req_doc_type}' ({best_doc.filename}) has low confidence "
                                    f"({best_doc.confidence:.2f}) or pending/unreadable text and requires human review."
                                ),
                                recommended_action="Inspect document or upload a finalized report.",
                                evidence_references=[
                                    {
                                        "source_document": best_doc.filename,
                                        "page": 1,
                                        "evidence_excerpt": preview_excerpt,
                                        "field_name": "document_type",
                                        "value": req_doc_type,
                                    }
                                ],
                                created_at=now,
                            )
                        )
                else:
                    unreadable_docs = [
                        d for d in docs if d.processing_mode in ("ocr_unavailable_fallback", "ocr_unavailable", "unreadable")
                    ]
                    if unreadable_docs:
                        findings.append(
                            ValidationFinding(
                                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                                claim_id=claim.claim_id,
                                status="REVIEW",
                                evidence_state="UNCERTAIN",
                                rule_id=rule.rule_id,
                                rule_version=rule.version,
                                source_reference=rule.source_reference,
                                check_type="REQUIRED_DOCUMENT",
                                issue=f"Unverified '{req_doc_type}' due to unreadable scan",
                                reason=(
                                    f"Required document '{req_doc_type}' was not confirmed in digital text, and "
                                    f"unreadable/scanned file '{unreadable_docs[0].filename}' requires human inspection."
                                ),
                                recommended_action="Inspect the scanned PDF or upload a digital copy.",
                                evidence_references=[
                                    {
                                        "source_document": unreadable_docs[0].filename,
                                        "page": 1,
                                        "evidence_excerpt": unreadable_docs[0].source_metadata.get("status_note", ""),
                                        "field_name": "document_type",
                                        "value": "unreadable_scanned_document",
                                    }
                                ],
                                created_at=now,
                            )
                        )
                    else:
                        findings.append(
                            ValidationFinding(
                                finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                                claim_id=claim.claim_id,
                                status="FAIL",
                                evidence_state="MISSING",
                                rule_id=rule.rule_id,
                                rule_version=rule.version,
                                source_reference=rule.source_reference,
                                check_type="REQUIRED_DOCUMENT",
                                issue=f"Missing required document: {req_doc_type}",
                                reason=(
                                    f"Required evidence not found in uploaded packet. Required document '{req_doc_type}' was not found in the uploaded packet."
                                ),
                                recommended_action=f"Upload '{req_doc_type}' PDF and rerun validation.",
                                evidence_references=[],
                                created_at=now,
                            )
                        )

        # Required field presence
        for req_field in rule.required_fields:
            occurrences = _collect_field_occurrences(docs, req_field)
            if not occurrences:
                findings.append(
                    ValidationFinding(
                        finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                        claim_id=claim.claim_id,
                        status="FAIL",
                        evidence_state="MISSING",
                        rule_id=rule.rule_id,
                        rule_version=rule.version,
                        source_reference=rule.source_reference,
                        check_type="REQUIRED_FIELD",
                        issue=f"Missing required field: {req_field}",
                        reason=f"Required evidence not found in uploaded packet. Required field '{req_field}' was not found in the uploaded packet.",
                        recommended_action=f"Confirm '{req_field}' from a source document or upload supporting PDF.",
                        evidence_references=[],
                        created_at=now,
                    )
                )
                continue

            best_doc, best_pf = max(
                occurrences,
                key=lambda item: (1.0 if item[1].manually_confirmed else item[1].confidence),
            )
            ev_ref = {
                "source_document": best_pf.source_document or best_doc.filename,
                "page": best_pf.page or 1,
                "evidence_excerpt": best_pf.evidence_excerpt or "",
                "field_name": req_field,
                "value": best_pf.value,
            }

            if best_pf.confidence < 0.70 and not best_pf.manually_confirmed:
                findings.append(
                    ValidationFinding(
                        finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                        claim_id=claim.claim_id,
                        status="REVIEW",
                        evidence_state="UNCERTAIN",
                        rule_id=rule.rule_id,
                        rule_version=rule.version,
                        source_reference=rule.source_reference,
                        check_type="REQUIRED_FIELD",
                        issue=f"Low-confidence field: {req_field}",
                        reason=(
                            f"Required field '{req_field}' was extracted with low confidence "
                            f"({best_pf.confidence:.2f}) from {best_doc.filename} and needs human confirmation."
                        ),
                        recommended_action=f"Verify '{req_field}' in Document Inspector.",
                        evidence_references=[ev_ref],
                        created_at=now,
                    )
                )
            else:
                findings.append(
                    ValidationFinding(
                        finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                        claim_id=claim.claim_id,
                        status="PASS",
                        evidence_state="PRESENT",
                        rule_id=rule.rule_id,
                        rule_version=rule.version,
                        source_reference=rule.source_reference,
                        check_type="REQUIRED_FIELD",
                        issue=f"Verified field: {req_field}",
                        reason=(
                            f"Required field '{req_field}' is supported by evidence in "
                            f"{best_pf.source_document or best_doc.filename} (page {best_pf.page or 1})."
                        ),
                        recommended_action="No action needed.",
                        evidence_references=[ev_ref],
                        created_at=now,
                    )
                )

    return findings


def validate_cross_document_consistency(
    claim: ClaimPacket,
    docs: List[ExtractedDoc],
) -> List[ValidationFinding]:
    """Compare supported fields across uploaded documents and flag conflicts as REVIEW with both provenance references."""
    findings: List[ValidationFinding] = []
    now = utc_now_iso()

    for field_name in CONSISTENCY_CHECK_FIELDS:
        occurrences = _collect_field_occurrences(docs, field_name)
        if len(occurrences) < 2:
            continue

        distinct_values: Dict[str, List[Dict[str, Any]]] = {}
        all_refs: List[Dict[str, Any]] = []
        for doc, pf in occurrences:
            norm_val = str(pf.value).strip()
            ref = {
                "source_document": pf.source_document or doc.filename,
                "page": pf.page or 1,
                "evidence_excerpt": pf.evidence_excerpt or "",
                "field_name": field_name,
                "value": norm_val,
            }
            all_refs.append(ref)
            distinct_values.setdefault(norm_val, []).append(ref)

        if len(distinct_values) > 1:
            conflict_summary = "; ".join(
                f"'{val}' in {', '.join(r['source_document'] + ' p.' + str(r['page']) for r in refs)}"
                for val, refs in distinct_values.items()
            )
            findings.append(
                ValidationFinding(
                    finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                    claim_id=claim.claim_id,
                    status="REVIEW",
                    evidence_state="UNCERTAIN",
                    rule_id=f"CONSISTENCY-{field_name.upper()}",
                    rule_version=1,
                    source_reference="SYNTH-CK-CONS (SYNTHETIC DEMO DATA — Cross-Document Consistency Standard)",
                    check_type="CONSISTENCY_CHECK",
                    issue=f"Conflicting {field_name} across uploaded documents",
                    reason=(
                        f"Conflicting values detected for '{field_name}' across uploaded documents: "
                        f"{conflict_summary}. Human review is required."
                    ),
                    recommended_action=f"Correct '{field_name}' in Document Inspector or record a reviewer disposition.",
                    evidence_references=all_refs,
                    created_at=now,
                )
            )
        else:
            findings.append(
                ValidationFinding(
                    finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                    claim_id=claim.claim_id,
                    status="PASS",
                    evidence_state="PRESENT",
                    rule_id=f"CONSISTENCY-{field_name.upper()}",
                    rule_version=1,
                    source_reference="SYNTH-CK-CONS (SYNTHETIC DEMO DATA — Cross-Document Consistency Standard)",
                    check_type="CONSISTENCY_CHECK",
                    issue=f"Consistent {field_name} across documents",
                    reason=f"Field '{field_name}' is consistent across {len(occurrences)} uploaded documents.",
                    recommended_action="No action needed.",
                    evidence_references=all_refs,
                    created_at=now,
                )
            )

    # Check chronological order of admission_date and discharge_date (CK-CONS-05)
    adm_occ = _collect_field_occurrences(docs, "admission_date")
    dis_occ = _collect_field_occurrences(docs, "discharge_date")
    if adm_occ and dis_occ:
        adm_doc, adm_pf = adm_occ[0]
        dis_doc, dis_pf = dis_occ[0]
        if str(dis_pf.value) < str(adm_pf.value):
            findings.append(
                ValidationFinding(
                    finding_id=f"FND-{uuid.uuid4().hex[:8]}",
                    claim_id=claim.claim_id,
                    status="REVIEW",
                    evidence_state="UNCERTAIN",
                    rule_id="CONSISTENCY-DATE-CHRONOLOGY",
                    rule_version=1,
                    source_reference="SYNTH-CK-CONS-05 (SYNTHETIC DEMO DATA)",
                    check_type="CONSISTENCY_CHECK",
                    issue="Discharge date precedes admission date",
                    reason=(
                        f"Discharge date ({dis_pf.value}) precedes admission date ({adm_pf.value}) "
                        f"in uploaded documents."
                    ),
                    recommended_action="Verify admission and discharge dates in Document Inspector.",
                    evidence_references=[
                        {
                            "source_document": adm_pf.source_document or adm_doc.filename,
                            "page": adm_pf.page or 1,
                            "evidence_excerpt": adm_pf.evidence_excerpt or "",
                            "field_name": "admission_date",
                            "value": adm_pf.value,
                        },
                        {
                            "source_document": dis_pf.source_document or dis_doc.filename,
                            "page": dis_pf.page or 1,
                            "evidence_excerpt": dis_pf.evidence_excerpt or "",
                            "field_name": "discharge_date",
                            "value": dis_pf.value,
                        },
                    ],
                    created_at=now,
                )
            )

    return findings
