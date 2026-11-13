"""FHIR R4 draft Bundle builder, structural & reference validator, backend gate, and local Mock NHCX simulator.

Uses pinned fhir.resources==6.4.0 (genuine FHIR R4, release 4.0.1).
FHIR R4 STRUCTURE CHECKED — NHCX/HCX PROFILE VALIDATION NOT IMPLEMENTED.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from models import (
    ClaimPacket,
    ExtractedDoc,
    ProvenanceField,
    ValidationFinding,
    ensure_fhir_r4_pydantic_bridge,
    utc_now_iso,
)

ensure_fhir_r4_pydantic_bridge()

from fhir.resources.bundle import Bundle  # noqa: E402
from fhir.resources.condition import Condition  # noqa: E402
from fhir.resources.diagnosticreport import DiagnosticReport  # noqa: E402
from fhir.resources.documentreference import DocumentReference  # noqa: E402
from fhir.resources.encounter import Encounter  # noqa: E402
from fhir.resources.observation import Observation  # noqa: E402
from fhir.resources.patient import Patient  # noqa: E402

FHIR_R4_VERSION_LABEL = "4.0.1 (FHIR R4)"
FHIR_BOUNDARY_DISCLAIMER = (
    "FHIR R4 STRUCTURE CHECKED — NHCX/HCX PROFILE VALIDATION NOT IMPLEMENTED. "
    "FHIR R4 structural validation is not NHCX/HCX profile conformance. "
    "Profile conformance, live gateway access, live claim submission, and adjudication are not implemented."
)


class FHIRGateBlockedError(RuntimeError):
    """Raised when FHIR R4 draft generation is attempted while FAIL or unresolved REVIEW findings exist."""


def check_fhir_gate(findings: List[ValidationFinding]) -> Tuple[bool, List[str]]:
    """Evaluate backend readiness gate for FHIR R4 generation."""
    if not findings:
        return False, ["Validation has not been executed for this claim packet yet."]

    blocking_reasons: List[str] = []
    for f in findings:
        if f.status == "FAIL":
            blocking_reasons.append(f"FAIL [{f.rule_id}]: {f.reason}")
        elif f.status == "REVIEW":
            disp = f.review_disposition
            if (
                disp is None
                or disp.action != "RESOLVED_REVIEW"
                or not (disp.reviewer and disp.reviewer.strip())
                or not (disp.rationale and disp.rationale.strip())
            ):
                blocking_reasons.append(f"Unresolved REVIEW [{f.rule_id}]: {f.reason}")

    return len(blocking_reasons) == 0, blocking_reasons


def _best_supported_field(
    docs: List[ExtractedDoc],
    field_name: str,
    findings: Optional[List[ValidationFinding]] = None,
) -> Optional[ProvenanceField]:
    # If there is a consistency conflict on this field that was dispositioned without a manual field correction,
    # omit the conflicted field rather than guessing one value.
    candidates: List[ProvenanceField] = []
    for d in docs:
        pf = (d.extracted_fields or d.fields).get(field_name)
        if pf and pf.is_known and pf.value is not None and str(pf.value).strip():
            candidates.append(pf)
    if not candidates:
        return None

    manually_confirmed = [c for c in candidates if c.manually_confirmed]
    if manually_confirmed:
        return manually_confirmed[0]

    distinct_vals = {str(c.value).strip() for c in candidates}
    if len(distinct_vals) > 1 and findings:
        # Check if conflict was dispositioned with rationale
        has_resolved_conflict = any(
            f.rule_id == f"CONSISTENCY-{field_name.upper()}"
            and f.review_disposition is not None
            for f in findings
        )
        if not has_resolved_conflict:
            return None

    return max(candidates, key=lambda p: p.confidence)


def build_fhir_r4_bundle(
    claim: ClaimPacket,
    docs: List[ExtractedDoc],
    findings: List[ValidationFinding],
) -> Dict[str, Any]:
    """Generate a gated FHIR R4 draft Bundle mapping only supported, evidence-backed fields."""
    allowed, blocking_reasons = check_fhir_gate(findings)
    if not allowed:
        raise FHIRGateBlockedError(
            "FHIR R4 draft generation blocked by backend gate: " + " | ".join(blocking_reasons)
        )

    patient_res_id = f"pat-{claim.claim_id.lower()}"
    encounter_res_id = f"enc-{claim.claim_id.lower()}"

    pf_name = _best_supported_field(docs, "patient_name", findings)
    pf_pid = _best_supported_field(docs, "patient_id", findings)
    pf_dob = _best_supported_field(docs, "dob", findings)
    pf_adm = _best_supported_field(docs, "admission_date", findings)
    pf_dis = _best_supported_field(docs, "discharge_date", findings)
    pf_diag = _best_supported_field(docs, "primary_diagnosis", findings)
    pf_inv = _best_supported_field(docs, "investigation_summary", findings)
    pf_plt = _best_supported_field(docs, "platelet_count", findings)

    # 1. Patient resource
    patient_kwargs: Dict[str, Any] = {
        "id": patient_res_id,
        "active": True,
    }
    if pf_pid and pf_pid.value:
        patient_kwargs["identifier"] = [
            {
                "system": "urn:claimkavach:synthetic:patient-id",
                "value": pf_pid.value,
            }
        ]
    if pf_name and pf_name.value:
        patient_kwargs["name"] = [{"text": pf_name.value}]
    if pf_dob and pf_dob.value and len(pf_dob.value) == 10 and pf_dob.value[4] == "-":
        patient_kwargs["birthDate"] = pf_dob.value

    patient_resource = Patient(**patient_kwargs)

    # 2. Encounter resource
    act_code = "SS" if (claim.care_setting or "").lower() in ("day_care", "day care") else "IMP"
    act_display = "short stay / day care" if act_code == "SS" else "inpatient encounter"
    enc_status = "finished" if (pf_dis and pf_dis.value) else "in-progress"

    encounter_kwargs: Dict[str, Any] = {
        "id": encounter_res_id,
        "status": enc_status,
        "class_fhir": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": act_code,
            "display": act_display,
        },
        "subject": {"reference": f"Patient/{patient_res_id}"},
    }
    period: Dict[str, str] = {}
    if pf_adm and pf_adm.value:
        period["start"] = pf_adm.value
    if pf_dis and pf_dis.value:
        period["end"] = pf_dis.value
    if period:
        encounter_kwargs["period"] = period

    encounter_resource = Encounter(**encounter_kwargs)

    entries: List[Dict[str, Any]] = [
        {"fullUrl": f"Patient/{patient_res_id}", "resource": patient_resource},
        {"fullUrl": f"Encounter/{encounter_res_id}", "resource": encounter_resource},
    ]

    # 3. Condition resource (code.text only; tagged terminology-unresolved, no invented ICD/SNOMED coding)
    diag_text = (pf_diag.value if pf_diag and pf_diag.value else claim.diagnosis) or ""
    if diag_text.strip():
        cond_id = f"cond-{claim.claim_id.lower()}"
        condition_resource = Condition(
            id=cond_id,
            meta={
                "tag": [
                    {
                        "system": "urn:claimkavach:local-meta",
                        "code": "terminology-unresolved",
                        "display": "Source diagnosis text preserved without external terminology coding",
                    }
                ]
            },
            clinicalStatus={
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                        "code": "active",
                    }
                ]
            },
            code={"text": diag_text.strip()},
            subject={"reference": f"Patient/{patient_res_id}"},
            encounter={"reference": f"Encounter/{encounter_res_id}"},
        )
        entries.append({"fullUrl": f"Condition/{cond_id}", "resource": condition_resource})

    # 4. Observation & DiagnosticReport resources (evidence-backed only)
    obs_text = (pf_inv.value if pf_inv and pf_inv.value else None) or (
        f"Platelet Count: {pf_plt.value}" if pf_plt and pf_plt.value else None
    )
    if obs_text:
        obs_id = f"obs-{claim.claim_id.lower()}"
        obs_resource = Observation(
            id=obs_id,
            status="final",
            code={"text": "Diagnostic Investigation Observation"},
            subject={"reference": f"Patient/{patient_res_id}"},
            encounter={"reference": f"Encounter/{encounter_res_id}"},
            valueString=obs_text,
        )
        entries.append({"fullUrl": f"Observation/{obs_id}", "resource": obs_resource})

        dr_id = f"diagrep-{claim.claim_id.lower()}"
        dr_resource = DiagnosticReport(
            id=dr_id,
            status="final",
            code={"text": "Laboratory / Diagnostic Investigation Report"},
            subject={"reference": f"Patient/{patient_res_id}"},
            encounter={"reference": f"Encounter/{encounter_res_id}"},
            result=[{"reference": f"Observation/{obs_id}"}],
            conclusion=obs_text,
        )
        entries.append({"fullUrl": f"DiagnosticReport/{dr_id}", "resource": dr_resource})

    # 5. DocumentReference resources for uploaded documents (filename, application/pdf, sha1/size metadata)
    for idx, doc in enumerate(docs, start=1):
        doc_ref_id = f"docref-{claim.claim_id.lower()}-{idx}"
        size_val = doc.source_metadata.get("size_bytes")
        attachment_dict: Dict[str, Any] = {
            "contentType": "application/pdf",
            "title": doc.filename,
        }
        if isinstance(size_val, int) and size_val > 0:
            attachment_dict["size"] = size_val

        doc_ref = DocumentReference(
            id=doc_ref_id,
            status="current",
            type={"text": doc.document_type},
            subject={"reference": f"Patient/{patient_res_id}"},
            description=f"Evidence document: {doc.filename} (mode: {doc.processing_mode})",
            content=[{"attachment": attachment_dict}],
        )
        entries.append({"fullUrl": f"DocumentReference/{doc_ref_id}", "resource": doc_ref})

    bundle = Bundle(
        id=f"bundle-{claim.claim_id.lower()}",
        type="collection",
        timestamp=utc_now_iso(),
        entry=entries,
    )

    bundle_dict = json.loads(bundle.json())
    return {
        "fhir_version": "4.0.1",
        "fhir_version_label": FHIR_R4_VERSION_LABEL,
        "disclaimer": FHIR_BOUNDARY_DISCLAIMER,
        "boundary_disclaimer": FHIR_BOUNDARY_DISCLAIMER,
        "omitted_fields": [],
        "bundle": bundle_dict,
    }


def _extract_references_recursive(obj: Any) -> List[str]:
    refs: List[str] = []
    if isinstance(obj, dict):
        if "reference" in obj and isinstance(obj["reference"], str):
            refs.append(obj["reference"])
        for v in obj.values():
            refs.extend(_extract_references_recursive(v))
    elif isinstance(obj, list):
        for item in obj:
            refs.extend(_extract_references_recursive(item))
    return refs


def validate_fhir_bundle_structure(bundle_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a FHIR R4 Bundle against fhir.resources==6.4.0 models and verify internal reference resolution."""
    raw_bundle = bundle_payload.get("bundle", bundle_payload) if isinstance(bundle_payload, dict) else {}
    errors: List[str] = []
    resolved_refs: List[str] = []

    try:
        parsed_bundle = Bundle.parse_obj(raw_bundle)
    except Exception as exc:
        return {
            "valid": False,
            "fhir_version": FHIR_R4_VERSION_LABEL,
            "resource_count": 0,
            "resolved_references": [],
            "errors": [f"FHIR R4 schema validation error: {exc}"],
            "disclaimer": FHIR_BOUNDARY_DISCLAIMER,
        }

    bundle_json = json.loads(parsed_bundle.json())
    entries = bundle_json.get("entry") or []
    available_targets = set()

    for idx, entry in enumerate(entries):
        res = entry.get("resource") or {}
        res_type = res.get("resourceType")
        res_id = res.get("id")
        full_url = entry.get("fullUrl")
        if not res_type or not res_id:
            errors.append(f"Bundle entry [{idx}] is missing resourceType or id.")
            continue
        available_targets.add(f"{res_type}/{res_id}")
        if full_url:
            available_targets.add(full_url)

    all_refs = _extract_references_recursive(entries)
    for ref in all_refs:
        if ref in available_targets:
            resolved_refs.append(ref)
        else:
            errors.append(f"Unresolved internal FHIR reference '{ref}' in Bundle.")

    return {
        "valid": len(errors) == 0,
        "fhir_version": FHIR_R4_VERSION_LABEL,
        "resource_count": len(entries),
        "resolved_references": sorted(set(resolved_refs)),
        "errors": errors,
        "disclaimer": FHIR_BOUNDARY_DISCLAIMER,
    }


validate_fhir_r4_bundle = validate_fhir_bundle_structure


def simulate_mock_nhcx_submission(
    claim_id: str,
    findings: List[ValidationFinding],
    bundle_payload: Optional[Dict[str, Any]] = None,
    simulate_mode: str = "auto",
) -> Dict[str, Any]:
    """Local-only synthetic Mock NHCX demonstration (zero network calls)."""
    gate_ok, blocking_reasons = check_fhir_gate(findings)
    banner = (
        "MOCK NHCX — LOCAL SIMULATION ONLY — NOT SUBMITTED TO ANY REAL GATEWAY — "
        "LOCAL SYNTHETIC MOCK NHCX RESPONSE — NO NETWORK CALL PERFORMED"
    )

    if simulate_mode == "force_failure" or not gate_ok or bundle_payload is None:
        return {
            "label": banner,
            "mock_banner": banner,
            "is_synthetic_mock": True,
            "network_calls_made": 0,
            "claim_id": claim_id,
            "status": "SYNTHETIC_MOCK_REJECTED",
            "response_code": "MOCK-ERR-PRECHECK-422",
            "correlation_id": f"MOCK-NHCX-ERR-{claim_id.upper()}",
            "timestamp": utc_now_iso(),
            "reasons": blocking_reasons or ["Simulated synthetic NHCX pre-check rejection requested by user."],
            "disclaimer": FHIR_BOUNDARY_DISCLAIMER,
        }

    struct_result = validate_fhir_bundle_structure(bundle_payload)
    if not struct_result["valid"]:
        return {
            "label": banner,
            "mock_banner": banner,
            "is_synthetic_mock": True,
            "network_calls_made": 0,
            "claim_id": claim_id,
            "status": "SYNTHETIC_MOCK_REJECTED",
            "response_code": "MOCK-ERR-FHIR-STRUCT-400",
            "correlation_id": f"MOCK-NHCX-STRUCT-ERR-{claim_id.upper()}",
            "timestamp": utc_now_iso(),
            "reasons": struct_result["errors"],
            "disclaimer": FHIR_BOUNDARY_DISCLAIMER,
        }

    return {
        "label": banner,
        "mock_banner": banner,
        "is_synthetic_mock": True,
        "network_calls_made": 0,
        "claim_id": claim_id,
        "status": "SYNTHETIC_MOCK_ACCEPTED_FOR_DEMO",
        "response_code": "MOCK-OK-200",
        "correlation_id": f"MOCK-NHCX-OK-{claim_id.upper()}",
        "timestamp": utc_now_iso(),
        "fhir_version_checked": FHIR_R4_VERSION_LABEL,
        "resource_count": struct_result["resource_count"],
        "reasons": [
            "Synthetic local sandbox pre-check passed. No external HCX/NHCX server was contacted."
        ],
        "disclaimer": FHIR_BOUNDARY_DISCLAIMER,
    }
