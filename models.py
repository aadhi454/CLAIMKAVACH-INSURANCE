"""Validated Pydantic schemas and FHIR R4 (fhir.resources==6.4.0) compatibility bridge for ClaimKavach MVP."""

from __future__ import annotations

import importlib
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import pydantic


def ensure_fhir_r4_pydantic_bridge() -> None:
    """Ensure fhir.resources==6.4.0 (genuine FHIR R4 4.0.1) works seamlessly with installed Pydantic."""
    if hasattr(pydantic, "__version__") and str(pydantic.__version__).startswith("2."):
        import pydantic.v1 as pv1

        submodules = [
            "class_validators",
            "error_wrappers",
            "errors",
            "fields",
            "main",
            "networks",
            "parse",
            "schema",
            "tools",
            "types",
            "typing",
            "utils",
            "validators",
            "datetime_parse",
            "color",
            "json",
        ]
        for sub in submodules:
            try:
                v1_mod = importlib.import_module(f"pydantic.v1.{sub}")
            except ImportError:
                continue
            try:
                v2_mod = importlib.import_module(f"pydantic.{sub}")
                for k, v in v1_mod.__dict__.items():
                    if not k.startswith("__") and k not in v2_mod.__dict__:
                        v2_mod.__dict__[k] = v
            except ImportError:
                sys.modules[f"pydantic.{sub}"] = v1_mod
                pydantic.__dict__[sub] = v1_mod

        for k, v in pv1.__dict__.items():
            if not k.startswith("__") and k not in pydantic.__dict__:
                pydantic.__dict__[k] = v

        pydantic.__dict__["BaseModel"] = pv1.BaseModel
        pydantic.__dict__["Field"] = pv1.Field
        pydantic.__dict__["Extra"] = pv1.Extra
        pydantic.__dict__["ValidationError"] = pv1.ValidationError
        from fhir.resources import (  # noqa: F401
            bundle,
            condition,
            diagnosticreport,
            documentreference,
            encounter,
            observation,
            patient,
        )


ensure_fhir_r4_pydantic_bridge()

from pydantic import BaseModel, Field  # noqa: E402


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CompatModel(BaseModel):
    """Base schema supporting both .dict() and .model_dump() / .to_dict()."""

    def to_dict(self) -> Dict[str, Any]:
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()


class ProvenanceField(CompatModel):
    field_name: str = ""
    value: Optional[str] = None
    is_known: bool = False
    source_document: Optional[str] = None
    source_doc: str = ""
    page: Optional[int] = 1
    line: Optional[int] = 1
    evidence_excerpt: Optional[str] = None
    excerpt: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    origin: str = "extracted"
    manually_confirmed: bool = False
    confirmed_by_human: bool = False
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[str] = None

    def __init__(self, **data: Any) -> None:
        if "source_document" in data and "source_doc" not in data:
            data["source_doc"] = data["source_document"] or ""
        elif "source_doc" in data and "source_document" not in data:
            data["source_document"] = data["source_doc"]

        if "evidence_excerpt" in data and "excerpt" not in data:
            data["excerpt"] = data["evidence_excerpt"] or ""
        elif "excerpt" in data and "evidence_excerpt" not in data:
            data["evidence_excerpt"] = data["excerpt"]

        if "manually_confirmed" in data and "confirmed_by_human" not in data:
            data["confirmed_by_human"] = bool(data["manually_confirmed"])
        elif "confirmed_by_human" in data and "manually_confirmed" not in data:
            data["manually_confirmed"] = bool(data["confirmed_by_human"])

        super().__init__(**data)


class ExtractedDoc(CompatModel):
    doc_id: str
    claim_id: str
    filename: str
    local_path: Optional[str] = None
    document_type: str = "other"
    subtype: Optional[str] = None
    document_subtype: Optional[str] = None
    fields: Dict[str, ProvenanceField] = Field(default_factory=dict)
    extracted_fields: Dict[str, ProvenanceField] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    processing_mode: str = "digital_pdf"
    ocr_Status_reason: str = ""
    page_count: int = 1
    file_sha256: str = ""
    source_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=utc_now_iso)

    def __init__(self, **data: Any) -> None:
        if "fields" in data and "extracted_fields" not in data:
            data["extracted_fields"] = data["fields"]
        elif "extracted_fields" in data and "fields" not in data:
            data["fields"] = data["extracted_fields"]

        if "subtype" in data and "document_subtype" not in data:
            data["document_subtype"] = data["subtype"]
        elif "document_subtype" in data and "subtype" not in data:
            data["subtype"] = data["document_subtype"]

        meta = data.get("source_metadata") or {}
        if not data.get("ocr_Status_reason"):
            data["ocr_Status_reason"] = str(meta.get("status_note", ""))
        if "page_count" not in data and "page_count" in meta:
            data["page_count"] = int(meta.get("page_count", 1))
        if not data.get("file_sha256"):
            data["file_sha256"] = str(meta.get("sha256", meta.get("file_hash", "")))

        super().__init__(**data)


class ClaimPacket(CompatModel):
    claim_id: str
    insurer: str
    policy_code: str = "A1"
    policy: Optional[str] = None
    claim_type: str = "Inpatient Cashless"
    relevant_date: str = "2026-10-10"
    care_setting: str = "inpatient"
    diagnosis: str = ""
    patient_reference: str = ""
    patient_name: str = ""
    status: str = "DRAFT"
    document_refs: List[str] = Field(default_factory=list)
    documents: List[ExtractedDoc] = Field(default_factory=list)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)

    def __init__(self, **data: Any) -> None:
        if "policy" in data and data["policy"] and "policy_code" not in data:
            data["policy_code"] = data["policy"]
        elif "policy_code" in data and "policy" not in data:
            data["policy"] = data["policy_code"]
        super().__init__(**data)


class RequirementSpec(CompatModel):
    evidence_key: str
    label: str
    kind: str = "document"
    accepted_doc_types: List[str] = Field(default_factory=list)
    content_patterns: List[str] = Field(default_factory=list)
    result_patterns: List[str] = Field(default_factory=list)
    pending_patterns: List[str] = Field(
        default_factory=lambda: ["pending", "awaited", "sample collected", "to follow"]
    )
    required_fields: List[str] = Field(default_factory=list)
    min_confidence: float = 0.65
    require_itemized: bool = False


class Rule(CompatModel):
    rule_id: str
    version: int = Field(default=1, ge=1)
    insurer: str = "*"
    policy_code: Optional[str] = None
    policy: Optional[str] = None
    claim_type: str = "*"
    rule_type: str = "document_required"
    description: str = ""
    conditions: List[str] = Field(default_factory=list)
    requirements: List[RequirementSpec] = Field(default_factory=list)
    required_documents: List[str] = Field(default_factory=list)
    required_fields: List[str] = Field(default_factory=list)
    severity: str = "critical"
    effective_from: str = "2026-01-01"
    effective_to: str = "2027-12-31"
    effective_start: str = "2026-01-01"
    effective_end: str = "2027-12-31"
    approval_status: str = "approved"
    approval_state: str = "APPROVED"
    approver: Optional[str] = "SYNTHETIC-SEED (demo)"
    approved_at: Optional[str] = Field(default_factory=utc_now_iso)
    source_reference: str = ""
    unverified_icd_label: Optional[str] = None
    is_synthetic: bool = True
    created_by: str = "SYNTHETIC-SEED"
    created_at: str = Field(default_factory=utc_now_iso)

    def __init__(self, **data: Any) -> None:
        if "policy" in data and "policy_code" not in data:
            data["policy_code"] = data["policy"]
        elif "policy_code" in data and "policy" not in data:
            data["policy"] = data["policy_code"]

        if "effective_from" in data and "effective_start" not in data:
            data["effective_start"] = data["effective_from"]
        elif "effective_start" in data and "effective_from" not in data:
            data["effective_from"] = data["effective_start"]

        if "effective_to" in data and "effective_end" not in data:
            data["effective_end"] = data["effective_to"]
        elif "effective_end" in data and "effective_to" not in data:
            data["effective_to"] = data["effective_end"]

        if "approval_status" in data and "approval_state" not in data:
            st = str(data["approval_status"]).lower()
            data["approval_state"] = st.upper()
            data["approval_status"] = st
        elif "approval_state" in data and "approval_status" not in data:
            st = str(data["approval_state"]).lower()
            data["approval_status"] = st
            data["approval_state"] = st.upper()
        else:
            st = str(data.get("approval_status", "approved")).lower()
            data["approval_status"] = st
            data["approval_state"] = st.upper()

        if isinstance(data.get("conditions"), dict):
            kw = data["conditions"].get("keywords", [])
            data["conditions"] = kw if isinstance(kw, list) else []

        super().__init__(**data)


class ReviewDisposition(CompatModel):
    disposition_id: str = "DISP-1"
    finding_id: str = ""
    reviewer: str
    timestamp: str = Field(default_factory=utc_now_iso)
    rationale: str
    action: str = "RESOLVED_REVIEW"
    disposition_status: str = "RESOLVED_REVIEW"

    def __init__(self, **data: Any) -> None:
        if "action" in data and "disposition_status" not in data:
            data["disposition_status"] = data["action"]
        elif "disposition_status" in data and "action" not in data:
            data["action"] = data["disposition_status"]
        super().__init__(**data)


class ValidationFinding(CompatModel):
    finding_id: str
    claim_id: str
    validation_run_id: str = "RUN-DEFAULT"
    status: str  # "PASS" | "FAIL" | "REVIEW"
    evidence_state: str = "PRESENT"
    rule_id: str
    rule_version: int = 1
    source_reference: str = ""
    check_type: str = "REQUIRED_EVIDENCE"
    check_code: str = "REQUIRED_EVIDENCE"
    issue: str = ""
    explanation: str = ""
    reason: str = ""
    source_doc: str = "NONE"
    page: Optional[int] = None
    line: Optional[int] = 1
    excerpt: str = ""
    field_name: Optional[str] = None
    evidence_references: List[Dict[str, Any]] = Field(default_factory=list)
    recommended_action: str = ""
    review_disposition: Optional[ReviewDisposition] = None
    created_at: str = Field(default_factory=utc_now_iso)

    def __init__(self, **data: Any) -> None:
        if not data.get("reason") and data.get("explanation"):
            data["reason"] = data["explanation"]
        elif data.get("reason") and not data.get("explanation"):
            data["explanation"] = data["reason"]
        if not data.get("issue"):
            data["issue"] = data.get("reason", "")[:120]
        if "check_type" in data and "check_code" not in data:
            data["check_code"] = data["check_type"]
        elif "check_code" in data and "check_type" not in data:
            data["check_type"] = data["check_code"]

        refs = data.get("evidence_references") or []
        if refs and isinstance(refs, list) and isinstance(refs[0], dict):
            first_ref = refs[0]
            if not data.get("source_doc") or data.get("source_doc") == "NONE":
                data["source_doc"] = str(first_ref.get("source_document") or "NONE")
            if data.get("page") is None and first_ref.get("page") is not None:
                data["page"] = int(first_ref["page"])
            if not data.get("excerpt") and first_ref.get("evidence_excerpt"):
                data["excerpt"] = str(first_ref["evidence_excerpt"])
            if not data.get("field_name") and first_ref.get("field_name"):
                data["field_name"] = str(first_ref["field_name"])

        if not data.get("evidence_state"):
            st = data.get("status", "PASS")
            data["evidence_state"] = (
                "PRESENT" if st == "PASS" else ("MISSING" if st == "FAIL" else "UNCERTAIN")
            )
        super().__init__(**data)


class ToolTrace(CompatModel):
    trace_id: str
    claim_id: str
    turn_index: int = 1
    tool: str
    reason: str
    redacted_input_summary: str
    redacted_output_summary: str
    mode: str = "DEMO FALLBACK"
    timestamp: str = Field(default_factory=utc_now_iso)


class AuditEntry(CompatModel):
    audit_id: str
    claim_id: Optional[str] = None
    actor: str
    action: str
    timestamp: str = Field(default_factory=utc_now_iso)
    redacted_details: str
