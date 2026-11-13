"""Synthetic demo PDF generator for ClaimKavach MVP.

Generates clearly labelled fictional PDFs ("SYNTHETIC DEMO DATA") in sample_data/
and scenario packets under sample_data/scenarios/:
- complete
- missing_investigation
- date_conflict
- low_quality

Also supports CLI usage:
    python sample_generator.py --scenario complete
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List
import warnings

warnings.filterwarnings("ignore", category=FutureWarning, module="fitz")
import fitz  # PyMuPDF


SYNTHETIC_BANNER = "SYNTHETIC DEMO DATA — ILLUSTRATIVE FICTIONAL HOSPITAL RECORD (NOT REAL PATIENT OR INSURER DATA)"


def _create_digital_pdf(path: Path, title: str, lines: List[str]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)

    rect = fitz.Rect(36, 28, 559, 58)
    page.draw_rect(rect, color=(0.75, 0.2, 0.1), fill=(0.99, 0.95, 0.92))
    page.insert_text(
        fitz.Point(44, 47),
        SYNTHETIC_BANNER,
        fontsize=8.5,
        fontname="helv",
        color=(0.6, 0.1, 0.05),
    )

    page.insert_text(
        fitz.Point(40, 88),
        title,
        fontsize=14.5,
        fontname="hebo",
        color=(0.08, 0.12, 0.2),
    )
    page.draw_line(fitz.Point(40, 98), fitz.Point(555, 98), color=(0.75, 0.78, 0.82))

    y = 122
    for line in lines:
        page.insert_text(
            fitz.Point(42, y),
            line,
            fontsize=10.5,
            fontname="helv",
            color=(0.12, 0.15, 0.2),
        )
        y += 20

    page.insert_text(
        fitz.Point(42, 805),
        "SYNTHETIC DEMO DATA — Fictional Sunrise Hospital — Page 1 of 1",
        fontsize=8.5,
        fontname="helv",
        color=(0.45, 0.48, 0.52),
    )
    doc.save(str(path))
    doc.close()
    return path


def _create_raster_scanned_pdf(path: Path, title: str, lines: List[str]) -> Path:
    """Create an image-only (scanned) PDF page with no embedded digital text layer."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_doc = fitz.open()
    temp_page = temp_doc.new_page(width=595, height=842)
    temp_page.insert_text(fitz.Point(40, 45), SYNTHETIC_BANNER, fontsize=8.5, fontname="helv")
    temp_page.insert_text(fitz.Point(40, 80), title, fontsize=14, fontname="hebo")
    y = 115
    for line in lines:
        temp_page.insert_text(fitz.Point(40, y), line, fontsize=10.5, fontname="helv")
        y += 20
    pix = temp_page.get_pixmap(dpi=130)
    img_bytes = pix.tobytes("png")
    temp_doc.close()

    scan_doc = fitz.open()
    scan_page = scan_doc.new_page(width=595, height=842)
    scan_page.insert_image(fitz.Rect(0, 0, 595, 842), stream=img_bytes)
    scan_doc.save(str(path))
    scan_doc.close()
    return path


def generate_sample_pdfs(output_dir: str | Path = "sample_data") -> Dict[str, str]:
    """Generate the five core synthetic PDFs plus supplementary conflict/pending/ID samples."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # 1. Clinical summary (Dengue case, Insurer A / Policy A1)
    clinical_path = _create_digital_pdf(
        out / "01_clinical_summary.pdf",
        "CLINICAL SUMMARY / ADMISSION EVALUATION (SYNTHETIC DEMO)",
        [
            "Document Type: Clinical Summary",
            "Hospital Name: Sunrise Fictional Hospital (Synthetic Demo)",
            "Patient Name: Demo Patient One (Synthetic)",
            "Patient ID: UHID-SYN-90412",
            "DOB: 1982-05-14",
            "Phone: +91-9810012345",
            "Email: demo.patient1@synthetic.example.org",
            "Address: 42 Fictional Enclave, Demo City",
            "Insurer: Fictional Insurer A",
            "Policy ID: POL-A1-778899",
            "Policy Name: Policy A1",
            "Claim Type: Cashless Pre-Auth",
            "Care Setting: Inpatient",
            "Admission Date: 2026-10-10",
            "Discharge Date: 2026-10-14",
            "Primary Diagnosis: Severe Dengue Fever with Thrombocytopenia (A90)",
            "ICD-10 Code: A90",
            "Procedure Name: Inpatient IV Fluid Resuscitation & Platelet Monitoring",
            "Attending Physician: Dr. Meera Nair (Synthetic)",
            "Clinical Notes: High-grade fever for 4 days, retro-orbital pain, petechiae, platelet drop.",
        ],
    )

    # 2. Investigation report (CBC with platelet count + Dengue NS1/IgM positive result)
    investigation_path = _create_digital_pdf(
        out / "02_investigation_report.pdf",
        "LABORATORY INVESTIGATION REPORT — HEMATOLOGY & SEROLOGY (SYNTHETIC DEMO)",
        [
            "Document Type: Investigation Report",
            "Subtype: Lab Hematology & Serology",
            "Patient Name: Demo Patient One (Synthetic)",
            "Patient ID: UHID-SYN-90412",
            "DOB: 1982-05-14",
            "Insurer: Fictional Insurer A",
            "Policy ID: POL-A1-778899",
            "Admission Date: 2026-10-10",
            "Primary Diagnosis: Severe Dengue Fever with Thrombocytopenia (A90)",
            "CBC Panel Result: Hemoglobin 13.8 g/dL, Total WBC 3,100 /uL, Hematocrit 44%",
            "Platelet Count: 28,000 /uL (Critical Low)",
            "Dengue NS1 Antigen Test: POSITIVE (Index 4.82 - Reactive)",
            "Dengue IgM ELISA: POSITIVE (1.94 Units)",
            "Investigation Summary: CBC confirms thrombocytopenia (Platelet Count 28,000 /uL); Dengue NS1 Antigen POSITIVE.",
            "Attending Physician: Dr. Meera Nair (Synthetic)",
        ],
    )

    # 3. Discharge / admission document
    discharge_path = _create_digital_pdf(
        out / "03_discharge_summary.pdf",
        "DISCHARGE & ADMISSION SUMMARY (SYNTHETIC DEMO)",
        [
            "Document Type: Discharge Summary",
            "Patient Name: Demo Patient One (Synthetic)",
            "Patient ID: UHID-SYN-90412",
            "DOB: 1982-05-14",
            "Insurer: Fictional Insurer A",
            "Policy ID: POL-A1-778899",
            "Admission Date: 2026-10-10",
            "Discharge Date: 2026-10-14",
            "Primary Diagnosis: Severe Dengue Fever with Thrombocytopenia (A90)",
            "ICD-10 Code: A90",
            "Procedure Name: Inpatient IV Fluid Resuscitation & Platelet Monitoring",
            "Course in Hospital: Managed with IV crystalloids and serial CBC monitoring; platelets recovered to 112,000 /uL.",
            "Attending Physician: Dr. Meera Nair (Synthetic)",
        ],
    )

    # 4. Itemized estimate / bill (with line items + amounts + total)
    estimate_path = _create_digital_pdf(
        out / "04_itemized_estimate.pdf",
        "ITEMIZED HOSPITAL ESTIMATE & TARIFF BREAKDOWN (SYNTHETIC DEMO)",
        [
            "Document Type: Itemized Estimate",
            "Patient Name: Demo Patient One (Synthetic)",
            "Patient ID: UHID-SYN-90412",
            "DOB: 1982-05-14",
            "Insurer: Fictional Insurer A",
            "Policy ID: POL-A1-778899",
            "Admission Date: 2026-10-10",
            "Discharge Date: 2026-10-14",
            "Primary Diagnosis: Severe Dengue Fever with Thrombocytopenia (A90)",
            "Line Item 01 - Acute Medical Ward Bed & Nursing (4 Days): INR 18,000",
            "Line Item 02 - Serial CBC & Dengue NS1/IgM Serology Panels: INR 6,500",
            "Line Item 03 - IV Crystalloids, Antipyretics & Consumables: INR 9,200",
            "Line Item 04 - Specialist Physician & Monitoring Visits: INR 8,800",
            "Total Estimated Amount: INR 42,500",
        ],
    )

    # 5a. Intentionally ambiguous / conflicting addendum (demonstrating consistency REVIEW + low confidence)
    ambiguous_path = _create_digital_pdf(
        out / "05_ambiguous_addendum.pdf",
        "PROVISIONAL WARD SLIP — AMBIGUOUS / CONFLICTING ENTRY (SYNTHETIC DEMO)",
        [
            "Document Type: Ambiguous Clinical Addendum",
            "Quality Note: LOW_CONFIDENCE_TRANSCRIPTION [UNCERTAIN HANDWRITTEN ENTRY]",
            "Patient Name: Demo Patient One (Synthetic)",
            "Patient ID: UHID-SYN-90499",
            "Policy ID: POL-A1-778899",
            "Admission Date: 2026-10-12",
            "Discharge Date: 2026-10-14",
            "Primary Diagnosis: Severe Dengue Fever with Thrombocytopenia (A90)",
            "Serology Note: Dengue NS1 sample collected, report awaited (pending).",
            "Ambiguity Notice: Provisional ward clerk note lists conflicting Patient ID (UHID-SYN-90499)",
            "and conflicting Admission Date (2026-10-12 vs 2026-10-10) requiring human review.",
        ],
    )

    # 5b. Pending serology slip ("NS1 sample collected, report awaited" -> UNCERTAIN / REVIEW)
    pending_serology_path = _create_digital_pdf(
        out / "05b_pending_serology_slip.pdf",
        "PRELIMINARY LAB COLLECTION SLIP — RESULT AWAITED (SYNTHETIC DEMO)",
        [
            "Document Type: Investigation Report",
            "Subtype: Lab Serology Collection Slip",
            "Patient Name: Demo Patient One (Synthetic)",
            "Patient ID: UHID-SYN-90412",
            "Policy ID: POL-A1-778899",
            "Admission Date: 2026-10-10",
            "Test Ordered: Dengue NS1 Antigen & IgM Serology",
            "Status: NS1 sample collected, report awaited (pending laboratory verification).",
        ],
    )

    # 6. Photo ID Proof (for Insurer B Policy B1 / Final Discharge rules)
    id_proof_path = _create_digital_pdf(
        out / "07_photo_id_proof.pdf",
        "SYNTHETIC PHOTO IDENTITY PROOF CARD (SYNTHETIC DEMO)",
        [
            "Document Type: Photo ID Proof",
            "Patient Name: Demo Patient One (Synthetic)",
            "Patient ID: UHID-SYN-90412",
            "DOB: 1982-05-14",
            "Synthetic ID Number: 9999 8888 7777",
            "Verification Status: Verified Synthetic Photo ID Copy Present",
        ],
    )

    # Also generate scenario subdirectories under sample_data/scenarios/
    scenarios_root = out / "scenarios"
    for scen_name, src_list in [
        ("complete", [clinical_path, investigation_path, discharge_path, estimate_path]),
        ("missing_investigation", [clinical_path, discharge_path, estimate_path]),
        ("date_conflict", [clinical_path, investigation_path, discharge_path, estimate_path, ambiguous_path]),
        ("low_quality", [clinical_path, pending_serology_path, discharge_path, estimate_path]),
    ]:
        scen_dir = scenarios_root / scen_name
        scen_dir.mkdir(parents=True, exist_ok=True)
        for src_p in src_list:
            dst_p = scen_dir / src_p.name
            dst_p.write_bytes(src_p.read_bytes())

    return {
        "clinical_summary": str(clinical_path),
        "investigation_report": str(investigation_path),
        "discharge_summary": str(discharge_path),
        "itemized_estimate": str(estimate_path),
        "ambiguous_addendum": str(ambiguous_path),
        "pending_serology": str(pending_serology_path),
        "id_proof": str(id_proof_path),
    }


def generate_scanned_ocr_sample(output_dir: str | Path = "sample_data") -> str:
    """Generate a raster-only scanned PDF (no digital text layer) to test OCR and OCR-absent fallback."""
    out = Path(output_dir)
    path = _create_raster_scanned_pdf(
        out / "06_scanned_raster_only.pdf",
        "SCANNED RASTER ATTACHMENT (OCR TEST SAMPLE — SYNTHETIC DEMO)",
        [
            "Document Type: Scanned Investigation Attachment",
            "Patient Name: Demo Patient One (Synthetic)",
            "Patient ID: UHID-SYN-90412",
            "Policy ID: POL-A1-778899",
            "Note: Raster image page without embedded digital text.",
        ],
    )
    return str(path)


def get_demo_packet_paths(
    preset: str = "complete",
    output_dir: str | Path = "sample_data",
) -> List[str]:
    files = generate_sample_pdfs(output_dir)
    if preset == "complete":
        return [
            files["clinical_summary"],
            files["investigation_report"],
            files["discharge_summary"],
            files["itemized_estimate"],
        ]
    if preset in ("missing_required", "missing_investigation"):
        return [
            files["clinical_summary"],
            files["discharge_summary"],
            files["itemized_estimate"],
        ]
    if preset in ("review_conflict", "date_conflict"):
        return [
            files["clinical_summary"],
            files["investigation_report"],
            files["discharge_summary"],
            files["itemized_estimate"],
            files["ambiguous_addendum"],
        ]
    if preset == "low_quality":
        return [
            files["clinical_summary"],
            files["pending_serology"],
            files["discharge_summary"],
            files["itemized_estimate"],
        ]
    return [
        files["clinical_summary"],
        files["investigation_report"],
        files["discharge_summary"],
        files["itemized_estimate"],
    ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic demo PDFs for ClaimKavach.")
    parser.add_argument(
        "--scenario",
        type=str,
        default="complete",
        choices=["complete", "missing_investigation", "date_conflict", "low_quality", "all"],
        help="Scenario packet to generate",
    )
    parser.add_argument("--out", type=str, default="sample_data", help="Output directory")
    parsed = parser.parse_args()
    all_files = generate_sample_pdfs(parsed.out)
    scan_file = generate_scanned_ocr_sample(parsed.out)
    if parsed.scenario == "all":
        print({"files": all_files, "scanned": scan_file})
    else:
        print(get_demo_packet_paths(parsed.scenario, parsed.out))
