"""Local PDF validation, PyMuPDF text extraction, Tesseract OCR fallback, document classification, and field provenance extraction."""

from __future__ import annotations

from datetime import datetime
import hashlib
import io
from pathlib import Path
import re
import shutil
from typing import Any, Dict, List, Optional, Tuple
import warnings

warnings.filterwarnings("ignore", category=FutureWarning, module="fitz")
import fitz  # PyMuPDF
from PIL import Image

try:
    import pytesseract
except ImportError:
    pytesseract = None  # type: ignore[assignment]

from models import ExtractedDoc, ProvenanceField, utc_now_iso
from pii_masker import GLOBAL_TOKEN_VAULT, ClaimTokenVault

MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB
MAX_PAGES_PER_FILE = 50


FIELD_PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    ("patient_name", re.compile(r"Patient Name:\s*(.+)", re.IGNORECASE)),
    ("patient_id", re.compile(r"(?:Patient ID|UHID|MRN):\s*([A-Z0-9-]+)", re.IGNORECASE)),
    ("dob", re.compile(r"(?:DOB|Date of Birth):\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}-[A-Za-z]{3}-\d{4})", re.IGNORECASE)),
    ("insurer", re.compile(r"Insurer:\s*(.+)", re.IGNORECASE)),
    ("policy_id", re.compile(r"(?:Policy ID|Policy No|Policy Number):\s*([A-Z0-9-]+)", re.IGNORECASE)),
    ("policy_name", re.compile(r"Policy Name:\s*(.+)", re.IGNORECASE)),
    ("claim_type", re.compile(r"Claim Type:\s*(.+)", re.IGNORECASE)),
    ("care_setting", re.compile(r"Care Setting:\s*(.+)", re.IGNORECASE)),
    ("admission_date", re.compile(r"Admission Date:\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}-[A-Za-z]{3}-\d{4})", re.IGNORECASE)),
    ("discharge_date", re.compile(r"Discharge Date:\s*(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}-[A-Za-z]{3}-\d{4})", re.IGNORECASE)),
    ("primary_diagnosis", re.compile(r"(?:Primary Diagnosis|Diagnosis):\s*(.+)", re.IGNORECASE)),
    ("icd10_code", re.compile(r"ICD-10 Code:\s*([A-Z0-9.]+)", re.IGNORECASE)),
    ("procedure_name", re.compile(r"Procedure(?: Name)?:\s*(.+)", re.IGNORECASE)),
    ("platelet_count", re.compile(r"Platelet Count:\s*([0-9,]+\s*/uL[^\n]*)", re.IGNORECASE)),
    ("dengue_serology", re.compile(r"(?:Dengue NS1 Antigen Test|Dengue IgM ELISA):\s*(.+)", re.IGNORECASE)),
    ("investigation_summary", re.compile(r"Investigation Summary:\s*(.+)", re.IGNORECASE)),
    ("total_estimated_amount", re.compile(r"(?:Total Estimated Amount|Total Bill Amount|Total Amount):\s*(.+)", re.IGNORECASE)),
    ("attending_physician", re.compile(r"Attending Physician:\s*(.+)", re.IGNORECASE)),
]

LINE_ITEM_PATTERN = re.compile(
    r"(Line Item\s*\d+[^:]*:\s*(?:INR|Rs\.?)\s*[0-9,]+)",
    re.IGNORECASE,
)


def normalize_date_to_iso(raw_date: str) -> str:
    cleaned = raw_date.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%b-%Y", "%d-%B-%Y"):
        try:
            return datetime.strptime(cleaned, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return cleaned


def is_tesseract_available(force_unavailable: bool = False) -> bool:
    if force_unavailable or pytesseract is None:
        return False
    return shutil.which("tesseract") is not None


def classify_document_text(filename: str, full_text: str) -> Tuple[str, Optional[str], float]:
    """Deterministic keyword/pattern classifier across all 15 supported hospital document types."""
    lower_name = filename.lower()
    lower_text = full_text.lower()

    if "low_confidence_transcription" in lower_text or "ambiguous clinical addendum" in lower_text or "ambiguous" in lower_name:
        return "ambiguous_document", "conflict_or_low_clarity", 0.52

    if "document type: itemized estimate" in lower_text or "itemized_estimate" in lower_name or "itemized hospital estimate" in lower_text:
        return "itemized_estimate", "estimate", 0.96
    if "document type: final bill" in lower_text or "final_bill" in lower_name or "itemized final bill" in lower_text:
        return "final_bill", "bill", 0.95
    if "document type: clinical summary" in lower_text or "clinical_summary" in lower_name or "clinical summary" in lower_text:
        return "clinical_summary", None, 0.96
    if "document type: admission note" in lower_text or "admission evaluation" in lower_text or "er triage note" in lower_text:
        return "admission_note", None, 0.94
    if "document type: discharge summary" in lower_text or "discharge_summary" in lower_name or "discharge & admission summary" in lower_text:
        return "discharge_summary", None, 0.96
    if "document type: consultation note" in lower_text or "consultation note" in lower_text:
        return "consultation_note", None, 0.92
    if "document type: photo id proof" in lower_text or "id_proof" in lower_name or "photo identity proof" in lower_text:
        return "id_proof", None, 0.95
    if "document type: investigation report" in lower_text or "investigation_report" in lower_name or "laboratory investigation report" in lower_text or "serology" in lower_text:
        subtype = "lab"
        if "ultrasound" in lower_text or "x-ray" in lower_text or "ct " in lower_text or "mri" in lower_text or "angiography" in lower_text or "biometry" in lower_text:
            subtype = "imaging"
        elif "ecg" in lower_text:
            subtype = "ecg"
        if "report awaited" in lower_text or "sample collected, report awaited" in lower_text:
            return "investigation_report", f"{subtype}_pending", 0.58
        return "investigation_report", subtype, 0.96
    if "estimate" in lower_name:
        return "itemized_estimate", "estimate", 0.94
    if "implant" in lower_text or "barcode sticker" in lower_text or "stent pouch" in lower_text or "iol barcode" in lower_text:
        return "implant_record", None, 0.93
    if "policy schedule" in lower_text or "policy_document" in lower_name:
        return "policy_document", None, 0.92
    if "medico-legal" in lower_text or "police fir" in lower_text or "mlc" in lower_text:
        return "medico_legal", None, 0.93
    if "ot notes" in lower_text or "operation theatre" in lower_text:
        return "ot_notes", None, 0.93
    if "histopathology" in lower_text or "biopsy report" in lower_text:
        return "histopathology", None, 0.94
    if "dialysis" in lower_text and "flow" in lower_text:
        return "dialysis_flowsheet", None, 0.93

    if not full_text.strip():
        return "unreadable_document", None, 0.15

    return "other", None, 0.65


def extract_fields_with_provenance(
    claim_id: str,
    filename: str,
    page_texts: List[Tuple[int, str]],
    base_confidence: float,
    vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
) -> Dict[str, ProvenanceField]:
    """Extract supported clinical and billing fields with exact source file, page, and verbatim excerpt."""
    extracted: Dict[str, ProvenanceField] = {}
    pii_categories = {
        "patient_name": "PERSON",
        "patient_id": "PATIENT_ID",
        "dob": "DOB",
        "policy_id": "POLICY_ID",
        "attending_physician": "PERSON",
    }
    date_fields = {"admission_date", "discharge_date", "dob"}
    line_items: List[str] = []

    for page_num, text in page_texts:
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue

            li_match = LINE_ITEM_PATTERN.search(line)
            if li_match:
                line_items.append(li_match.group(1).strip())

            for field_name, pattern in FIELD_PATTERNS:
                match = pattern.search(line)
                if match:
                    val = match.group(1).strip()
                    if val:
                        if field_name in date_fields:
                            val = normalize_date_to_iso(val)
                        if field_name in pii_categories:
                            vault.register_known_pii(claim_id, pii_categories[field_name], val)
                        extracted[field_name] = ProvenanceField(
                            field_name=field_name,
                            value=val,
                            is_known=True,
                            source_document=filename,
                            page=page_num,
                            evidence_excerpt=line,
                            confidence=round(base_confidence, 2),
                            origin="extracted",
                        )

    if line_items:
        extracted["line_items_summary"] = ProvenanceField(
            field_name="line_items_summary",
            value=f"{len(line_items)} itemized line(s): " + "; ".join(line_items[:4]),
            is_known=True,
            source_document=filename,
            page=1,
            evidence_excerpt=line_items[0],
            confidence=round(base_confidence, 2),
            origin="extracted",
        )

    return extracted


def process_pdf_document(
    claim_id: str,
    pdf_path: str | Path,
    force_ocr_unavailable: bool = False,
    vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
) -> ExtractedDoc:
    """Validate PDF, extract per-page text with PyMuPDF, run Tesseract OCR if needed, and extract provenance."""
    path = Path(pdf_path)
    filename = path.name
    raw_bytes = path.read_bytes()
    file_size = len(raw_bytes)
    sha256_hex = hashlib.sha256(raw_bytes).hexdigest()
    sha1_hex = hashlib.sha1(raw_bytes).hexdigest()
    doc_id = f"DOC-{claim_id}-{sha256_hex[:8]}"

    # Validate magic bytes & file size
    if not raw_bytes.startswith(b"%PDF") or file_size > MAX_FILE_BYTES:
        return ExtractedDoc(
            doc_id=doc_id,
            claim_id=claim_id,
            filename=filename,
            local_path=str(path.resolve()),
            document_type="unreadable_document",
            fields={},
            confidence=0.0,
            processing_mode="unreadable",
            source_metadata={
                "filename": filename,
                "sha256": sha256_hex,
                "sha1": sha1_hex,
                "size_bytes": file_size,
                "page_count": 0,
                "ocr_attempted": False,
                "ocr_available": is_tesseract_available(force_unavailable=force_ocr_unavailable),
                "status_note": "Invalid PDF header or exceeds 20 MB limit. Routed to REVIEW.",
                "page_previews": {},
            },
            created_at=utc_now_iso(),
        )

    try:
        pdf_doc = fitz.open(str(path))
        if pdf_doc.is_encrypted:
            pdf_doc.close()
            raise ValueError("Encrypted PDF cannot be read without password.")
    except Exception as exc:
        return ExtractedDoc(
            doc_id=doc_id,
            claim_id=claim_id,
            filename=filename,
            local_path=str(path.resolve()),
            document_type="unreadable_document",
            fields={},
            confidence=0.0,
            processing_mode="unreadable",
            source_metadata={
                "filename": filename,
                "sha256": sha256_hex,
                "sha1": sha1_hex,
                "size_bytes": file_size,
                "page_count": 0,
                "ocr_attempted": False,
                "ocr_available": is_tesseract_available(force_unavailable=force_ocr_unavailable),
                "status_note": f"Corrupt or encrypted PDF ({exc}). Routed to REVIEW.",
                "page_previews": {},
            },
            created_at=utc_now_iso(),
        )

    page_count = min(len(pdf_doc), MAX_PAGES_PER_FILE)
    page_texts: List[Tuple[int, str]] = []
    total_digital_chars = 0

    for idx in range(page_count):
        page = pdf_doc[idx]
        txt = page.get_text("text") or ""
        total_digital_chars += len(txt.strip())
        page_texts.append((idx + 1, txt))

    processing_mode = "digital_pdf"
    ocr_attempted = False
    ocr_available = is_tesseract_available(force_unavailable=force_ocr_unavailable)
    ocr_mean_conf: Optional[float] = None
    status_note = "Extracted digital text layer via PyMuPDF."

    if total_digital_chars < 20:
        ocr_attempted = True
        if ocr_available:
            ocr_page_texts: List[Tuple[int, str]] = []
            conf_scores: List[float] = []
            try:
                for idx in range(page_count):
                    page = pdf_doc[idx]
                    pix = page.get_pixmap(dpi=150)
                    img = Image.open(io.BytesIO(pix.tobytes("png")))
                    ocr_txt = pytesseract.image_to_string(img) or ""
                    ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                    for c_val in ocr_data.get("conf", []):
                        try:
                            cf = float(c_val)
                            if cf >= 0:
                                conf_scores.append(cf)
                        except (ValueError, TypeError):
                            pass
                    ocr_page_texts.append((idx + 1, ocr_txt))
                page_texts = ocr_page_texts
                ocr_mean_conf = (sum(conf_scores) / len(conf_scores)) if conf_scores else 65.0
                processing_mode = "tesseract_ocr"
                status_note = f"Extracted text via local Tesseract OCR (mean word confidence: {ocr_mean_conf:.1f}%)."
            except Exception as exc:
                processing_mode = "ocr_unavailable_fallback"
                ocr_available = False
                status_note = f"OCR unavailable (Tesseract failed: {exc}). Routed to REVIEW."
        else:
            processing_mode = "ocr_unavailable_fallback"
            status_note = (
                "OCR unavailable (Tesseract not installed). Scanned PDF routed to REVIEW without fabricating OCR output."
            )

    pdf_doc.close()

    combined_text = "\n".join(t for _, t in page_texts)
    doc_type, subtype, doc_conf = classify_document_text(filename, combined_text)

    if processing_mode == "ocr_unavailable_fallback":
        doc_conf = 0.15
        if doc_type in ("unreadable_document", "other"):
            doc_type = "unreadable_scanned_document"
    elif processing_mode == "tesseract_ocr":
        if ocr_mean_conf is not None and ocr_mean_conf < 60.0:
            doc_conf = 0.45
        else:
            doc_conf = min(doc_conf, 0.78)

    fields = extract_fields_with_provenance(
        claim_id=claim_id,
        filename=filename,
        page_texts=page_texts,
        base_confidence=doc_conf,
        vault=vault,
    )

    page_excerpts = {
        str(pnum): (txt.strip()[:800] if txt.strip() else "[No digital text on page]")
        for pnum, txt in page_texts
    }

    return ExtractedDoc(
        doc_id=doc_id,
        claim_id=claim_id,
        filename=filename,
        local_path=str(path.resolve()),
        document_type=doc_type,
        subtype=subtype,
        fields=fields,
        extracted_fields=fields,
        confidence=round(doc_conf, 2),
        processing_mode=processing_mode,
        source_metadata={
            "filename": filename,
            "sha256": sha256_hex,
            "sha1": sha1_hex,
            "size_bytes": file_size,
            "page_count": page_count,
            "digital_char_count": total_digital_chars,
            "ocr_attempted": ocr_attempted,
            "ocr_available": ocr_available,
            "ocr_mean_confidence": ocr_mean_conf,
            "status_note": status_note,
            "file_hash": sha256_hex[:16],
            "page_previews": page_excerpts,
        },
        created_at=utc_now_iso(),
    )
