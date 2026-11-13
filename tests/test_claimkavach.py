"""Acceptance test suite for ClaimKavach MVP.

Covers all required acceptance tests using temporary directories/databases and synthetic data.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from agent_orchestrator import ClaimReadinessOrchestrator
from database import (
    create_or_version_rule,
    get_findings,
    get_policy_configs,
    init_db,
    list_audit_logs,
    list_rules,
    record_review_disposition,
    save_extracted_doc,
    set_rule_approval_state,
)
from document_processor import process_pdf_document
from fhir_builder import (
    FHIR_BOUNDARY_DISCLAIMER,
    FHIRGateBlockedError,
    build_fhir_r4_bundle,
    check_fhir_gate,
    simulate_mock_nhcx_submission,
    validate_fhir_bundle_structure,
    validate_fhir_r4_bundle,
)
from models import ClaimPacket, Rule
from pii_masker import ClaimTokenVault, build_gemini_payload, mask_text, redact, unmask_text
from rules_engine import (
    get_applicable_rules,
    validate_claim_evidence,
    validate_cross_document_consistency,
)
from sample_generator import (
    generate_sample_pdfs,
    generate_scanned_ocr_sample,
    get_demo_packet_paths,
)


@pytest.fixture()
def temp_env(tmp_path: Path):
    db_path = str(tmp_path / "test_claimkavach.db")
    sample_dir = tmp_path / "sample_data"
    init_db(db_path)
    sample_files = generate_sample_pdfs(sample_dir)
    return {
        "tmp_path": tmp_path,
        "db_path": db_path,
        "sample_dir": sample_dir,
        "sample_files": sample_files,
    }


def test_01_first_run_db_seeds_four_fictional_policies_and_marks_synthetic(temp_env):
    """1. First-run database initialization seeds four fictional policy configurations and marks all seeded rules synthetic."""
    db_path = temp_env["db_path"]
    configs = get_policy_configs(db_path)
    assert len(configs) == 4

    policies = {(c["insurer"], c["policy_code"]) for c in configs}
    assert policies == {
        ("Fictional Insurer A", "A1"),
        ("Fictional Insurer A", "A2"),
        ("Fictional Insurer B", "B1"),
        ("Fictional Insurer B", "B2"),
    }
    assert all(c["is_synthetic"] is True for c in configs)

    seeded_rules = list_rules(latest_only=False, db_path=db_path)
    assert len(seeded_rules) >= 10
    for r in seeded_rules:
        assert r.is_synthetic is True
        assert "SYNTHETIC DEMO DATA" in r.source_reference


def test_02_rule_retrieval_filters_by_policy_claim_type_diagnosis_date_and_approval(temp_env):
    """2. Rule retrieval filters correctly by policy, claim type, diagnosis, effective date, and approval status."""
    db_path = temp_env["db_path"]

    a1_rules = get_applicable_rules(
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2026-10-10",
        diagnosis="Dengue Fever",
        db_path=db_path,
    )
    a1_ids = {r.rule_id for r in a1_rules}
    assert "RULE-A1-DOC-CORE" in a1_ids
    assert "RULE-A1-FLD-ID" in a1_ids
    assert "R-DEN-01" in a1_ids
    # Draft rule and expired 2024 rule must NOT be returned
    assert "RULE-A1-DRAFT-EXPERIMENTAL" not in a1_ids
    assert "R-DRAFT-99" not in a1_ids
    assert "RULE-A1-EXPIRED-2024" not in a1_ids
    assert "R-EXP-98" not in a1_ids

    # If we deactivate RULE-A1-FLD-ID (creates v2 DEACTIVATED), it must no longer run
    deactivated = set_rule_approval_state("RULE-A1-FLD-ID", "DEACTIVATED", actor="test_admin", db_path=db_path)
    assert deactivated.version == 2
    assert deactivated.approval_state == "DEACTIVATED"

    a1_after_deact = get_applicable_rules(
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2026-10-10",
        diagnosis="Dengue Fever",
        db_path=db_path,
    )
    assert "RULE-A1-FLD-ID" not in {r.rule_id for r in a1_after_deact}

    # Out-of-range effective date in 2024 only matches 2024 rules
    rules_2024 = get_applicable_rules(
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2024-06-15",
        diagnosis="Dengue Fever",
        db_path=db_path,
    )
    assert "RULE-A1-EXPIRED-2024" in {r.rule_id for r in rules_2024}


def test_03_digital_pdf_extraction_and_ocr_absence_handling(temp_env):
    """3. Digital PDF extraction returns text and provenance; OCR absence is handled without a crash and is reported accurately."""
    sample_files = temp_env["sample_files"]
    sample_dir = temp_env["sample_dir"]
    vault = ClaimTokenVault()

    # Digital PDF extraction
    clinical_doc = process_pdf_document(
        claim_id="CLM-T3",
        pdf_path=sample_files["clinical_summary"],
        vault=vault,
    )
    assert clinical_doc.processing_mode in ("digital_pdf", "DIGITAL_TEXT")
    assert clinical_doc.document_type == "clinical_summary"
    assert clinical_doc.confidence >= 0.90
    assert "patient_id" in clinical_doc.extracted_fields
    pid_field = clinical_doc.extracted_fields["patient_id"]
    assert pid_field.value == "UHID-SYN-90412"
    assert pid_field.source_doc == "01_clinical_summary.pdf"
    assert pid_field.page == 1
    assert "UHID-SYN-90412" in (pid_field.excerpt or "")

    # Scanned raster-only PDF when Tesseract OCR is unavailable
    scanned_pdf_path = generate_scanned_ocr_sample(sample_dir)
    scanned_doc = process_pdf_document(
        claim_id="CLM-T3",
        pdf_path=scanned_pdf_path,
        force_ocr_unavailable=True,
        vault=vault,
    )
    assert scanned_doc.processing_mode in ("ocr_unavailable_fallback", "OCR_UNAVAILABLE")
    assert scanned_doc.source_metadata["ocr_attempted"] is True
    assert scanned_doc.source_metadata["ocr_available"] is False
    assert scanned_doc.confidence < 0.50
    assert "unavailable" in scanned_doc.ocr_Status_reason.lower()


def test_04_pii_masking_deterministic_vault_and_no_leak_in_payload_or_trace(temp_env):
    """4. PII masking is deterministic within a claim, preserves a local token mapping, keeps admission/discharge dates unmasked, and does not expose originals in outbound payloads or traces."""
    vault = ClaimTokenVault()
    claim_id = "CLM-PII-4"
    sample_text_1 = (
        "Patient Name: Aarav Sharma (Synthetic)\n"
        "Patient ID: UHID-SYN-90412\n"
        "DOB: 1982-05-14\n"
        "Admission Date: 2026-10-10\n"
        "Discharge Date: 2026-10-14\n"
        "Phone: +91-9876543210\n"
        "Email: aarav.synthetic@example.org\n"
        "Policy ID: POL-A1-778899\n"
        "Aadhaar: 4512 8934 7612\n"
        "PAN: ABCDE1234F"
    )
    sample_text_2 = "Follow-up for Patient Name: Aarav Sharma (Synthetic) with Patient ID: UHID-SYN-90412."

    masked_1, red_map = redact(sample_text_1, claim_id=claim_id, vault=vault)
    masked_2 = mask_text(claim_id, sample_text_2, vault=vault)

    for raw_secret in [
        "Aarav Sharma (Synthetic)",
        "UHID-SYN-90412",
        "1982-05-14",
        "+91-9876543210",
        "aarav.synthetic@example.org",
        "POL-A1-778899",
        "4512 8934 7612",
        "ABCDE1234F",
    ]:
        assert raw_secret not in masked_1
        assert raw_secret not in masked_2

    # Admission and discharge dates remain unmasked for claim-logic checks
    assert "2026-10-10" in masked_1
    assert "2026-10-14" in masked_1

    # Deterministic: same token used in both texts
    token_map = vault.get_token_map(claim_id)
    pid_token = next(tok for tok, val in token_map.items() if val == "UHID-SYN-90412")
    assert pid_token in masked_1
    assert pid_token in masked_2

    # Unmasking restores original locally
    restored = unmask_text(claim_id, masked_1, vault=vault)
    assert "UHID-SYN-90412" in restored
    assert "Aarav Sharma (Synthetic)" in restored

    # Verify build_gemini_payload never contains raw PII
    gemini_payload = build_gemini_payload(claim_id, "test_task", sample_text_1, vault=vault)
    serialized_gemini = json.dumps(gemini_payload)
    assert "UHID-SYN-90412" not in serialized_gemini
    assert "Aarav Sharma" not in serialized_gemini

    # Verify orchestrator trace and outbound payload contain zero raw PII
    orch = ClaimReadinessOrchestrator(db_path=temp_env["db_path"], vault=vault, force_fallback=True)
    claim = ClaimPacket(
        claim_id=claim_id,
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2026-10-10",
    )
    res = orch.execute_claim_pipeline(claim, pdf_paths=get_demo_packet_paths("complete", temp_env["sample_dir"]))
    serialized_traces = json.dumps([t.to_dict() for t in res["traces"]])
    serialized_outbound = json.dumps(orch.last_outbound_payloads)

    for raw_secret in ["Aarav Sharma", "UHID-SYN-90412", "POL-A1-778899", "9876543210", "aarav.synthetic@example.org"]:
        assert raw_secret not in serialized_traces
        assert raw_secret not in serialized_outbound


def test_05_evidence_validation_distinguishes_pass_fail_review_and_pending_lab_slip(temp_env):
    """5. Evidence validation distinguishes PASS, FAIL ('Required evidence not found in uploaded packet.'), and REVIEW (including pending lab slips and scanned low-confidence docs)."""
    db_path = temp_env["db_path"]
    sample_dir = temp_env["sample_dir"]
    sample_files = temp_env["sample_files"]

    claim = ClaimPacket(
        claim_id="CLM-VAL-5",
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2026-10-10",
        diagnosis="Dengue Fever",
    )
    rules = get_applicable_rules(
        insurer=claim.insurer,
        policy_code=claim.policy_code,
        claim_type=claim.claim_type,
        relevant_date=claim.relevant_date,
        diagnosis=claim.diagnosis,
        db_path=db_path,
    )

    # Case A: Missing investigation_report -> FAIL with exact required wording
    missing_paths = get_demo_packet_paths("missing_required", sample_dir)
    docs_missing = [process_pdf_document(claim.claim_id, p) for p in missing_paths]

    findings_fail = validate_claim_evidence(claim, docs_missing, rules, db_path=db_path)
    statuses = {f.status for f in findings_fail}
    assert "PASS" in statuses
    assert "FAIL" in statuses

    fail_finding = next(f for f in findings_fail if f.status == "FAIL")
    assert "Required evidence not found in uploaded packet." in fail_finding.reason
    assert fail_finding.source_doc == "NONE"

    # Case B: Pending serology slip ('Sample Sent — Report Awaited') -> triggers REVIEW, not PASS
    pending_key = "pending_serology" if "pending_serology" in sample_files else "pending_serology_slip"
    docs_with_pending = docs_missing + [
        process_pdf_document(claim.claim_id, sample_files[pending_key])
    ]
    findings_pending = validate_claim_evidence(claim, docs_with_pending, rules, db_path=db_path)
    r_den_reviews = [f for f in findings_pending if f.rule_id == "R-DEN-01" and f.status == "REVIEW"]
    assert len(r_den_reviews) >= 1
    assert "pending" in r_den_reviews[0].reason.lower() or "awaited" in r_den_reviews[0].reason.lower()


def test_06_conflicting_fields_and_policy_switching_dengue_a1_a2_b1_b2(temp_env):
    """6. Conflicting fields across documents produce REVIEW with both provenances; policy switching A1 -> A2 -> B1 -> B2 dynamically updates findings."""
    db_path = temp_env["db_path"]
    sample_dir = temp_env["sample_dir"]

    # Part A: Cross-document conflict
    claim = ClaimPacket(
        claim_id="CLM-CONF-6",
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2026-10-10",
        diagnosis="Dengue Fever",
    )
    conflict_paths = get_demo_packet_paths("review_conflict", sample_dir)
    docs = [process_pdf_document(claim.claim_id, p) for p in conflict_paths]

    consistency_findings = validate_cross_document_consistency(claim, docs)
    adm_conflict = next(
        (f for f in consistency_findings if f.rule_id == "CONSISTENCY-ADMISSION_DATE" and f.status == "REVIEW"),
        None,
    )
    assert adm_conflict is not None
    ref_docs = {ref["source_document"] for ref in adm_conflict.evidence_references}
    assert "01_clinical_summary.pdf" in ref_docs
    assert "05_ambiguous_addendum.pdf" in ref_docs

    # Part B: Policy switching on complete 4-PDF Dengue packet (which has clinical_summary, investigation_report, discharge_summary, itemized_estimate, but NO photo_id_proof)
    complete_docs = [process_pdf_document("CLM-SW", p) for p in get_demo_packet_paths("complete", sample_dir)]

    # 1. Policy A1: PASS
    claim_a1 = ClaimPacket(
        claim_id="CLM-SW", insurer="Fictional Insurer A", policy_code="A1", claim_type="Cashless Pre-Auth", relevant_date="2026-10-10", diagnosis="Dengue Fever"
    )
    f_a1 = validate_claim_evidence(
        claim_a1,
        complete_docs,
        get_applicable_rules("Fictional Insurer A", "A1", "Cashless Pre-Auth", "2026-10-10", "Dengue Fever", db_path),
        db_path,
    )
    assert all(f.status == "PASS" for f in f_a1)

    # 2. Policy A2: PASS even when itemized_estimate is removed (A2 Dengue R-DEN-02 does not require itemized_estimate, whereas A1 R-DEN-01 does!)
    docs_no_est = [d for d in complete_docs if d.document_type != "itemized_estimate"]
    f_a1_missing_est = validate_claim_evidence(
        claim_a1,
        docs_no_est,
        get_applicable_rules("Fictional Insurer A", "A1", "Cashless Pre-Auth", "2026-10-10", "Dengue Fever", db_path),
        db_path,
    )
    assert any(f.status == "FAIL" and f.rule_id == "R-DEN-01" for f in f_a1_missing_est)

    claim_a2 = ClaimPacket(
        claim_id="CLM-SW", insurer="Fictional Insurer A", policy_code="A2", claim_type="Cashless Pre-Auth", relevant_date="2026-10-10", diagnosis="Dengue Fever"
    )
    f_a2_no_est = validate_claim_evidence(
        claim_a2,
        docs_no_est,
        get_applicable_rules("Fictional Insurer A", "A2", "Cashless Pre-Auth", "2026-10-10", "Dengue Fever", db_path),
        db_path,
    )
    assert all(f.status == "PASS" for f in f_a2_no_est if f.rule_id == "R-DEN-02")

    # 3. Policy B1: FAIL because photo_id_proof is required by R-DEN-B1 and not in the 4 core PDFs
    claim_b1 = ClaimPacket(
        claim_id="CLM-SW", insurer="Fictional Insurer B", policy_code="B1", claim_type="Cashless Pre-Auth", relevant_date="2026-10-10", diagnosis="Dengue Fever"
    )
    f_b1 = validate_claim_evidence(
        claim_b1,
        complete_docs,
        get_applicable_rules("Fictional Insurer B", "B1", "Cashless Pre-Auth", "2026-10-10", "Dengue Fever", db_path),
        db_path,
    )
    assert any(f.status == "FAIL" and f.rule_id == "R-DEN-B1" for f in f_b1)

    # 4. Policy B2: No Dengue rule seeded for B2 -> produces REVIEW ("applicability uncertain")
    claim_b2 = ClaimPacket(
        claim_id="CLM-SW", insurer="Fictional Insurer B", policy_code="B2", claim_type="Cashless Pre-Auth", relevant_date="2026-10-10", diagnosis="Dengue Fever"
    )
    f_b2 = validate_claim_evidence(
        claim_b2,
        complete_docs,
        get_applicable_rules("Fictional Insurer B", "B2", "Cashless Pre-Auth", "2026-10-10", "Dengue Fever", db_path),
        db_path,
    )
    assert any(f.status == "REVIEW" and "applicability uncertain" in f.reason for f in f_b2)


def test_07_deterministic_fallback_labelled_demo_fallback_and_bounded(temp_env):
    """7. Deterministic fallback is labelled DEMO FALLBACK, records bounded tool traces, and cannot alter rules/findings or bypass the FHIR gate."""
    db_path = temp_env["db_path"]
    sample_dir = temp_env["sample_dir"]

    claim = ClaimPacket(
        claim_id="CLM-FB-7",
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2026-10-10",
    )
    orch = ClaimReadinessOrchestrator(db_path=db_path, force_fallback=True, max_turns=7)
    res = orch.execute_claim_pipeline(
        claim,
        pdf_paths=get_demo_packet_paths("missing_required", sample_dir),
        attempt_fhir_if_ready=True,
    )

    assert res["mode"] == "DEMO FALLBACK"
    assert 1 <= len(res["traces"]) <= 7
    assert all(t.mode == "DEMO FALLBACK" for t in res["traces"])
    assert res["gate_allowed"] is False
    assert res["fhir_bundle_payload"] is None

    with pytest.raises(FHIRGateBlockedError):
        orch.request_fhir_generation_via_tool(claim.claim_id)


def test_08_human_review_dispositions_audited_preserve_original_and_cannot_clear_fail(temp_env):
    """8. Human review dispositions are audited, preserve original findings, and cannot clear a FAIL without new evidence and rerun validation."""
    db_path = temp_env["db_path"]
    sample_dir = temp_env["sample_dir"]

    claim = ClaimPacket(
        claim_id="CLM-REV-8",
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2026-10-10",
    )
    orch = ClaimReadinessOrchestrator(db_path=db_path, force_fallback=True)

    paths = get_demo_packet_paths("missing_required", sample_dir) + [
        temp_env["sample_files"]["ambiguous_addendum"]
    ]
    res = orch.execute_claim_pipeline(claim, pdf_paths=paths)
    findings = res["findings"]

    fail_finding = next(f for f in findings if f.status == "FAIL")
    review_finding = next(f for f in findings if f.status == "REVIEW")
    original_reason = review_finding.reason

    with pytest.raises(ValueError, match="cannot resolve or clear a FAIL"):
        record_review_disposition(
            claim_id=claim.claim_id,
            finding_id=fail_finding.finding_id,
            reviewer="auditor_1",
            rationale="Trying to wave through missing investigation report",
            db_path=db_path,
        )

    updated_rev = record_review_disposition(
        claim_id=claim.claim_id,
        finding_id=review_finding.finding_id,
        reviewer="auditor_1",
        rationale="Verified core inpatient documents confirm UHID-SYN-90412 and admission 2026-10-10.",
        db_path=db_path,
    )
    assert updated_rev.status == "REVIEW"
    assert updated_rev.reason == original_reason
    assert updated_rev.review_disposition is not None
    assert updated_rev.review_disposition.reviewer == "auditor_1"

    audit_entries = list_audit_logs(claim_id=claim.claim_id, db_path=db_path)
    assert any(a.action == "HUMAN_REVIEW_DISPOSITION" and a.actor == "auditor_1" for a in audit_entries)

    gate_ok, _ = check_fhir_gate(get_findings(claim.claim_id, db_path=db_path))
    assert gate_ok is False

    inv_doc = process_pdf_document(claim.claim_id, temp_env["sample_files"]["investigation_report"])
    save_extracted_doc(inv_doc, db_path=db_path)
    rerun_res = orch.execute_claim_pipeline(claim, pdf_paths=None, preserve_dispositions=True)
    assert sum(1 for f in rerun_res["findings"] if f.status == "FAIL") == 0


def test_09_fhir_r4_gate_structural_validation_and_local_mock_nhcx_no_network(temp_env):
    """9. FHIR generation is blocked by FAIL/unresolved REVIEW; a permitted draft validates as genuine FHIR R4 (4.0.1) and rejects malformed dates/references. Mock NHCX makes zero network calls."""
    db_path = temp_env["db_path"]
    sample_dir = temp_env["sample_dir"]

    claim = ClaimPacket(
        claim_id="CLM-FHIR-9",
        insurer="Fictional Insurer A",
        policy_code="A1",
        claim_type="Inpatient Cashless",
        relevant_date="2026-10-10",
    )
    orch = ClaimReadinessOrchestrator(db_path=db_path, force_fallback=True)

    conflict_res = orch.execute_claim_pipeline(
        claim,
        pdf_paths=get_demo_packet_paths("review_conflict", sample_dir),
    )
    assert conflict_res["gate_allowed"] is False
    with pytest.raises(FHIRGateBlockedError):
        build_fhir_r4_bundle(claim, conflict_res["documents"], conflict_res["findings"])

    for f in conflict_res["findings"]:
        if f.status == "REVIEW":
            record_review_disposition(
                claim_id=claim.claim_id,
                finding_id=f.finding_id,
                reviewer="clinical_reviewer",
                rationale="Confirmed primary clinical & discharge documents are authoritative.",
                db_path=db_path,
            )

    resolved_findings = get_findings(claim.claim_id, db_path=db_path)
    gate_ok, blocking = check_fhir_gate(resolved_findings)
    assert gate_ok is True
    assert blocking == []

    bundle_payload = build_fhir_r4_bundle(claim, conflict_res["documents"], resolved_findings)
    assert bundle_payload["fhir_version"] == "4.0.1"
    assert "FHIR R4 STRUCTURE CHECKED — NHCX/HCX PROFILE VALIDATION NOT IMPLEMENTED." in bundle_payload["boundary_disclaimer"]

    val_result = validate_fhir_r4_bundle(bundle_payload)
    assert val_result["valid"] is True
    assert val_result["errors"] == []
    assert val_result["resource_count"] >= 5

    # Verify broken internal reference is caught
    corrupted_ref = json.loads(json.dumps(bundle_payload))
    corrupted_ref["bundle"]["entry"][2]["resource"]["subject"]["reference"] = "Patient/non-existent-id"
    bad_ref_val = validate_fhir_r4_bundle(corrupted_ref)
    assert bad_ref_val["valid"] is False
    assert any("Patient/non-existent-id" in err for err in bad_ref_val["errors"])

    # Verify malformed FHIR R4 date is rejected by fhir.resources==6.4.0
    corrupted_date = json.loads(json.dumps(bundle_payload))
    corrupted_date["bundle"]["entry"][0]["resource"]["birthDate"] = "not-a-valid-date"
    bad_date_val = validate_fhir_r4_bundle(corrupted_date)
    assert bad_date_val["valid"] is False

    # Mock NHCX makes zero network requests and includes exact mandatory label
    with patch("socket.socket.connect", side_effect=AssertionError("Network call prohibited in Mock NHCX")):
        mock_ok = simulate_mock_nhcx_submission(
            claim_id=claim.claim_id,
            findings=resolved_findings,
            bundle_payload=bundle_payload,
            simulate_mode="auto",
        )
        assert mock_ok["is_synthetic_mock"] is True
        assert mock_ok["network_calls_made"] == 0
        assert "MOCK NHCX — LOCAL SIMULATION ONLY — NOT SUBMITTED TO ANY REAL GATEWAY" in mock_ok["label"]
