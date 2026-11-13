"""ClaimKavach MVP — Local-First Hospital Insurance Claim-Readiness Assistant (Streamlit UI).

Run locally with:
    streamlit run app.py
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import List

import streamlit as st

from agent_orchestrator import ClaimReadinessOrchestrator
from database import (
    DEFAULT_DB_PATH,
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
    save_extracted_doc,
    set_rule_approval_state,
    update_extracted_field_by_reviewer,
)
from document_processor import is_tesseract_available, process_pdf_document
from fhir_builder import (
    FHIR_BOUNDARY_DISCLAIMER,
    FHIRGateBlockedError,
    build_fhir_r4_bundle,
    check_fhir_gate,
    simulate_mock_nhcx_submission,
    validate_fhir_bundle_structure,
)
from models import ClaimPacket, Rule
from pii_masker import GLOBAL_TOKEN_VAULT, PRIVACY_LIMITATION_NOTICE
from sample_generator import generate_sample_pdfs


UPLOAD_STORAGE_DIR = Path("local_uploads")


def ensure_startup() -> dict[str, str]:
    init_db(DEFAULT_DB_PATH)
    sample_files = generate_sample_pdfs("sample_data")
    UPLOAD_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return sample_files


def run_user_upload_pipeline(
    claim_id: str,
    insurer: str,
    policy_code: str,
    claim_type: str,
    relevant_date: str,
    diagnosis: str,
    care_setting: str,
    pdf_paths: List[str],
    force_demo_fallback: bool,
) -> None:
    progress_bar = st.progress(0, text="Reading uploaded PDF documents...")
    with st.status("Validating Uploaded Documents...", expanded=True) as status_box:
        st.write("1/4 Extracting PDF text & classifying document types via PyMuPDF / Tesseract OCR...")
        progress_bar.progress(25, text="Classifying uploaded PDFs...")
        time.sleep(0.1)

        st.write("2/4 Masking obvious PII locally into per-claim token vault...")
        progress_bar.progress(50, text="Masking PII locally...")
        time.sleep(0.1)

        st.write("3/4 Evaluating applicable insurer & diagnosis rules...")
        progress_bar.progress(75, text="Evaluating rules & cross-document consistency...")

        packet = ClaimPacket(
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
            force_fallback=force_demo_fallback,
        )
        result = orch.execute_claim_pipeline(
            packet,
            pdf_paths=pdf_paths,
            preserve_dispositions=False,
            replace_documents=True,
        )

        st.write("4/4 Checking FHIR R4 readiness gate...")
        progress_bar.progress(100, text="Validation complete.")
        status_box.update(
            label=f"Validated {len(result['documents'])} uploaded PDF(s) for {claim_id} ({result['mode']})",
            state="complete",
            expanded=False,
        )


def render_app() -> None:
    st.set_page_config(
        page_title="ClaimKavach — Hospital Claim Readiness Assistant",
        layout="wide",
    )
    sample_files = ensure_startup()

    st.title("ClaimKavach — Hospital Claim Readiness Assistant")
    st.caption(
        "Upload your hospital claim PDFs below. ClaimKavach classifies each uploaded document, extracts clinical "
        "and billing fields with page/line provenance, masks PII locally, and validates completeness against "
        "approved synthetic insurer rules."
    )
    st.warning(FHIR_BOUNDARY_DISCLAIMER)

    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    gemini_configured = bool(gemini_key and gemini_key != "MY_GEMINI_API_KEY")
    tesseract_ok = is_tesseract_available()

    col_m1, col_m2 = st.columns(2)
    with col_m1:
        st.info(
            f"Mode: **{'GEMINI_MASKED (PII Masked Locally)' if gemini_configured else 'DEMO FALLBACK (Deterministic Local)'}**"
        )
    with col_m2:
        st.info(
            f"Local Tesseract OCR: **{'Available' if tesseract_ok else 'Unavailable (Scanned PDFs route to REVIEW)'}**"
        )

    policy_configs = get_policy_configs(DEFAULT_DB_PATH)
    existing_claims = list_claims(DEFAULT_DB_PATH)

    if "active_claim_id" not in st.session_state:
        st.session_state["active_claim_id"] = existing_claims[0].claim_id if existing_claims else "CLM-101"

    active_claim_id = st.session_state["active_claim_id"]
    active_claim = get_claim(active_claim_id, DEFAULT_DB_PATH)
    active_docs = get_claim_documents(active_claim_id, DEFAULT_DB_PATH)
    active_findings = get_findings(active_claim_id, DEFAULT_DB_PATH)
    active_traces = get_tool_traces(active_claim_id, DEFAULT_DB_PATH)

    tabs = st.tabs(
        [
            "1. Upload & Validate",
            "2. Validation Checklist",
            "3. Human Review & Edit Fields",
            "4. FHIR R4 & Mock NHCX",
            "5. Agent Trace & Privacy",
            "6. Rules & Audit",
        ]
    )

    # TAB 1: USER-DRIVEN UPLOAD & VALIDATE
    with tabs[0]:
        st.subheader("Upload Claim Documents & Validate")
        c_left, c_right = st.columns([1, 1])

        with c_left:
            uploaded_files = st.file_uploader(
                "Upload Hospital Claim PDFs (Clinical Summary, Lab Report, Discharge Summary, Estimate, ID Proof)",
                type=["pdf"],
                accept_multiple_files=True,
            )

            with st.expander("Need sample PDFs to test? Attach individual sample files"):
                selected_samples = st.multiselect(
                    "Select individual synthetic PDFs to include",
                    options=sorted(list({Path(v).name for v in sample_files.values()})),
                )

        with c_right:
            claim_id_input = st.text_input("Claim ID", value=active_claim_id)
            insurer_list = sorted(list({cfg["insurer"] for cfg in policy_configs}))
            insurer = st.selectbox("Insurer", options=insurer_list)
            matching_policies = [cfg["policy_code"] for cfg in policy_configs if cfg["insurer"] == insurer]
            policy_code = st.selectbox("Policy Code", options=matching_policies)
            claim_type = st.selectbox(
                "Claim Type",
                options=["Inpatient Cashless", "Cashless Pre-Auth", "Final Discharge", "Reimbursement"],
            )
            c_d1, c_d2 = st.columns(2)
            with c_d1:
                relevant_date = st.text_input("Relevant / Admission Date", value="2026-10-10")
            with c_d2:
                diagnosis = st.text_input("Diagnosis (Optional / Auto-detected)", value="")
            care_setting = st.selectbox("Care Setting", options=["inpatient", "daycare"])
            force_demo_fallback = st.checkbox(
                "Force Deterministic DEMO FALLBACK Mode",
                value=not gemini_configured,
            )

            if st.button("Validate Uploaded Documents", type="primary", use_container_width=True):
                pdf_paths: List[str] = []
                if uploaded_files:
                    claim_upload_dir = UPLOAD_STORAGE_DIR / claim_id_input
                    claim_upload_dir.mkdir(parents=True, exist_ok=True)
                    for uf in uploaded_files:
                        dest = claim_upload_dir / Path(uf.name).name
                        dest.write_bytes(uf.getvalue())
                        pdf_paths.append(str(dest))

                for s_name in selected_samples:
                    candidate = Path("sample_data") / s_name
                    if candidate.exists():
                        pdf_paths.append(str(candidate))

                if not pdf_paths:
                    st.error("Please upload at least one PDF file (or attach a sample PDF) to validate.")
                else:
                    st.session_state["active_claim_id"] = claim_id_input
                    run_user_upload_pipeline(
                        claim_id=claim_id_input,
                        insurer=insurer,
                        policy_code=policy_code,
                        claim_type=claim_type,
                        relevant_date=relevant_date,
                        diagnosis=diagnosis,
                        care_setting=care_setting,
                        pdf_paths=pdf_paths,
                        force_demo_fallback=force_demo_fallback,
                    )
                    st.rerun()

        if active_docs:
            st.markdown("---")
            st.markdown(f"### Uploaded Documents & Detected Types (`{active_claim_id}`)")
            for d in active_docs:
                st.write(
                    f"- **{d.filename}** → Detected Type: `{d.document_type}` "
                    f"| Mode: `{d.processing_mode}` | Confidence: `{int(d.confidence * 100)}%`"
                )

    # TAB 2: VALIDATION CHECKLIST
    with tabs[1]:
        st.subheader(f"Validation Checklist — `{active_claim_id}`")
        if not active_findings:
            st.info("Upload and validate PDF documents in Tab 1 to see your readiness checklist.")
        else:
            pass_cnt = sum(1 for f in active_findings if f.status == "PASS")
            fail_cnt = sum(1 for f in active_findings if f.status == "FAIL")
            rev_cnt = sum(1 for f in active_findings if f.status == "REVIEW")
            k1, k2, k3 = st.columns(3)
            k1.metric("PASS", pass_cnt)
            k2.metric("FAIL (Missing Evidence)", fail_cnt)
            k3.metric("REVIEW (Needs Verification)", rev_cnt)

            for f in active_findings:
                badge = f"[{f.status}] {f.rule_id} — {f.check_code}"
                with st.expander(badge, expanded=(f.status != "PASS")):
                    st.markdown(f"**Reason:** {f.reason}")
                    st.markdown(f"**Source Document:** `{f.source_doc}` (Page: `{f.page}`, Line: `{f.line}`)")
                    if f.excerpt:
                        st.code(f.excerpt)
                    if f.review_disposition:
                        st.info(
                            f"Reviewed by **{f.review_disposition.reviewer}** at `{f.review_disposition.timestamp}`: "
                            f"{f.review_disposition.rationale} ({f.review_disposition.disposition_status})"
                        )

    # TAB 3: HUMAN REVIEW
    with tabs[2]:
        st.subheader(f"Human Review & Field Confirmation — `{active_claim_id}`")
        review_findings = [f for f in active_findings if f.status == "REVIEW"]
        if review_findings:
            selected_f = st.selectbox(
                "Select REVIEW Finding",
                options=review_findings,
                format_func=lambda f: f"{f.finding_id} | {f.rule_id}: {f.reason[:80]}",
            )
            rev_name = st.text_input("Reviewer Name / ID", value="billing_reviewer_01")
            rev_rationale = st.text_area("Reviewer Rationale (Required)")
            if st.button("Record Human Disposition"):
                record_review_disposition(
                    claim_id=active_claim_id,
                    finding_id=selected_f.finding_id,
                    reviewer=rev_name,
                    rationale=rev_rationale,
                    db_path=DEFAULT_DB_PATH,
                )
                st.success("Recorded REVIEW disposition.")
                st.rerun()

        if active_docs:
            st.markdown("---")
            sel_doc = st.selectbox(
                "Select Uploaded Document to Edit Field",
                options=active_docs,
                format_func=lambda d: f"{d.filename} ({d.document_type})",
            )
            field_names = list(sel_doc.extracted_fields.keys()) or [
                "patient_id",
                "policy_id",
                "admission_date",
                "discharge_date",
                "primary_diagnosis",
                "total_estimated_cost",
            ]
            field_key = st.selectbox("Field Name", options=field_names)
            cur_pf = sel_doc.extracted_fields.get(field_key)
            new_val = st.text_input("Confirmed Value", value=cur_pf.value if (cur_pf and cur_pf.value) else "")
            conf_reason = st.text_input("Rationale", value="Verified against uploaded PDF")
            if st.button("Save Field & Re-validate"):
                update_extracted_field_by_reviewer(
                    claim_id=active_claim_id,
                    doc_id=sel_doc.doc_id,
                    field_name=field_key,
                    new_value=new_val,
                    reviewer="billing_reviewer_01",
                    rationale=conf_reason,
                    db_path=DEFAULT_DB_PATH,
                )
                if active_claim:
                    orch = ClaimReadinessOrchestrator(db_path=DEFAULT_DB_PATH)
                    orch.execute_claim_pipeline(active_claim, pdf_paths=None, preserve_dispositions=True)
                st.rerun()

    # TAB 4: FHIR R4 & MOCK NHCX
    with tabs[3]:
        st.subheader(f"Gated FHIR R4 Draft Bundle & Local Mock NHCX — `{active_claim_id}`")
        st.warning(FHIR_BOUNDARY_DISCLAIMER)

        gate_ok, gate_reasons = check_fhir_gate(active_findings) if active_findings else (False, ["No findings yet."])
        if not gate_ok:
            st.error("FHIR R4 Export Gate is Locked:")
            for r in gate_reasons:
                st.write(f"- {r}")
        elif active_claim:
            try:
                bundle_payload = build_fhir_r4_bundle(active_claim, active_docs, active_findings)
                val_res = validate_fhir_bundle_structure(bundle_payload)
                st.success(
                    f"FHIR R4 Bundle Valid: {val_res['valid']} | Version: {val_res['fhir_version']} | Resources: {val_res['resource_count']}"
                )
                bundle_json_str = json.dumps(bundle_payload, indent=2)
                st.download_button(
                    "Download FHIR R4 Draft Bundle JSON",
                    data=bundle_json_str,
                    file_name=f"{active_claim_id}_fhir_r4_bundle.json",
                    mime="application/json",
                )
                with st.expander("View FHIR R4 Bundle JSON"):
                    st.code(bundle_json_str, language="json")
            except FHIRGateBlockedError as exc:
                st.error(str(exc))

        st.markdown("---")
        st.markdown("### Local-Only Mock NHCX Sandbox (Zero Network Calls)")
        if st.button("Run Local Mock NHCX Check"):
            bundle_for_mock = None
            if gate_ok and active_claim:
                bundle_for_mock = build_fhir_r4_bundle(active_claim, active_docs, active_findings)
            mock_resp = simulate_mock_nhcx_submission(
                claim_id=active_claim_id,
                findings=active_findings,
                bundle_payload=bundle_for_mock,
            )
            st.json(mock_resp)

    # TAB 5: AGENT TRACE & PRIVACY
    with tabs[4]:
        st.subheader("Bounded Orchestrator Tool Trace & Local PII Masking")
        st.info(PRIVACY_LIMITATION_NOTICE)
        for t in active_traces:
            st.markdown(f"**#{t.turn_index} `{t.tool}`** ({t.mode}) — {t.reason}")
            c1, c2 = st.columns(2)
            c1.code(t.redacted_input_summary, language="json")
            c2.code(t.redacted_output_summary, language="json")
        token_map = GLOBAL_TOKEN_VAULT.get_token_map(active_claim_id)
        st.write("Active Token Vault Keys:", list(token_map.keys()))

    # TAB 6: RULES & AUDIT
    with tabs[5]:
        st.subheader("Versioned Synthetic Rules & Audit Log")
        for r in list_rules(latest_only=False, db_path=DEFAULT_DB_PATH):
            with st.expander(f"{r.rule_id} (v{r.version}) | {r.insurer} · {r.policy_code} [{r.approval_state}]"):
                st.write(r.description)
                st.write("Required Docs:", r.required_documents)
                st.write("Required Fields:", r.required_fields)
                if r.approval_state != "APPROVED":
                    if st.button(f"Approve {r.rule_id}", key=f"app_{r.rule_id}_{r.version}"):
                        set_rule_approval_state(r.rule_id, "APPROVED", actor="admin_ui", db_path=DEFAULT_DB_PATH)
                        st.rerun()
                else:
                    if st.button(f"Deactivate {r.rule_id}", key=f"deact_{r.rule_id}_{r.version}"):
                        set_rule_approval_state(r.rule_id, "DEACTIVATED", actor="admin_ui", db_path=DEFAULT_DB_PATH)
                        st.rerun()

        st.markdown("### Audit Log Trail")
        for lg in list_audit_logs(claim_id=active_claim_id, db_path=DEFAULT_DB_PATH)[:20]:
            st.text(f"[{lg.timestamp}] {lg.actor} -> {lg.action}: {lg.redacted_details}")


if __name__ == "__main__":
    render_app()
