"""Generate a local, explainable PDF assessment report for a verified claim."""

from __future__ import annotations

import re
import textwrap
from pathlib import Path
from typing import Any, Iterable

import fitz

from models import ClaimPacket, ExtractedDoc, ValidationFinding


REPORT_DIR = Path("generated_reports")


def _safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "claim"


def _lines(values: Iterable[str], width: int = 105) -> list[str]:
    output: list[str] = []
    for value in values:
        output.extend(textwrap.wrap(str(value), width=width) or [""])
    return output


def generate_assessment_report(
    claim: ClaimPacket,
    documents: list[ExtractedDoc],
    findings: list[ValidationFinding],
    risk_summary: dict[str, Any],
    gate_allowed: bool,
    blocking_reasons: list[str],
) -> Path:
    """Create a branded assessment report without implying payment adjudication."""
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = REPORT_DIR / f"{_safe_filename(claim.claim_id)}_assessment.pdf"
    document = fitz.open()

    page = document.new_page()
    margin = 52
    content_width = page.rect.width - (margin * 2)
    y = 52

    def heading(text: str, size: float = 18) -> None:
        nonlocal y
        page.insert_text((margin, y), text, fontsize=size, fontname="hebo", color=(0.04, 0.18, 0.32))
        y += size + 12

    def label_value(label: str, value: str) -> None:
        nonlocal y
        page.insert_text((margin, y), label.upper(), fontsize=8, fontname="hebo", color=(0.32, 0.42, 0.52))
        page.insert_text((margin + 112, y), value, fontsize=9.5, fontname="helv", color=(0.05, 0.08, 0.12))
        y += 16

    def paragraph(text: str, color: tuple[float, float, float] = (0.18, 0.24, 0.3)) -> None:
        nonlocal page, y
        for line in _lines([text]):
            if y > page.rect.height - 70:
                page = document.new_page()
                y = 52
            page.insert_text((margin, y), line, fontsize=9.5, fontname="helv", color=color)
            y += 14
        y += 4

    page.draw_rect(fitz.Rect(0, 0, page.rect.width, 22), color=None, fill=(0.02, 0.12, 0.22))
    page.insert_text((margin, y), "CLAIMKAVACH", fontsize=24, fontname="hebo", color=(0.02, 0.55, 0.72))
    y += 30
    page.insert_text((margin, y), "CLAIM ASSESSMENT REPORT", fontsize=10, fontname="hebo", color=(0.32, 0.42, 0.52))
    y += 30
    paragraph(
        "Verification assessment generated from the local ClaimKavach evidence, deterministic policy checks, "
        "and recorded reviewer dispositions. This document is not a final payment approval or denial."
    )

    heading("Claim overview")
    label_value("Claim reference", claim.claim_id)
    label_value("Insurer / policy", f"{claim.insurer} / {claim.policy_code}")
    label_value("Claim type", claim.claim_type)
    label_value("Diagnosis", claim.diagnosis or "Not captured")
    label_value("Requested amount", claim.estimated_amount or "Not captured")
    label_value("Relevant date", claim.relevant_date)
    label_value("Verification status", claim.status)
    y += 8

    heading("Readiness assessment")
    score = risk_summary.get("score", 0)
    band = risk_summary.get("band", "NOT_RUN")
    page.insert_text((margin, y), f"{score}/100  {band}", fontsize=22, fontname="hebo", color=(0.02, 0.55, 0.72))
    y += 28
    paragraph(str(risk_summary.get("headline", "No readiness assessment is available.")))
    counts = risk_summary.get("counts", {})
    label_value("Checks", f"{counts.get('pass', 0)} pass / {counts.get('fail', 0)} fail / {counts.get('review', 0)} review")
    label_value("FHIR export gate", "UNBLOCKED" if gate_allowed else "BLOCKED")
    y += 8

    heading("Evidence inventory")
    for doc in documents:
        paragraph(f"{doc.filename} — {doc.document_type}; {doc.processing_mode}; confidence {doc.confidence:.0%}")
    if not documents:
        paragraph("No documents were available for this assessment.")

    heading("Verification findings")
    for finding in findings:
        disposition = f"; disposition: {finding.review_disposition}" if finding.review_disposition else ""
        paragraph(f"[{finding.status}] {finding.rule_id}: {finding.issue or finding.reason}{disposition}")
    if not findings:
        paragraph("No verification findings were recorded.")

    heading("Next actions and boundary")
    for action in risk_summary.get("next_actions", []):
        paragraph(f"• {action}")
    for reason in blocking_reasons:
        paragraph(f"Gate blocker: {reason}")
    paragraph(
        "Synthetic demonstration data, fictional insurers, and local mock gateway outputs must not be interpreted "
        "as live insurer adjudication or NHCX conformance."
    )

    for report_page in document:
        report_page.insert_text(
            (margin, report_page.rect.height - 28),
            "ClaimKavach • Local-first assessment • Synthetic/demo boundary applies",
            fontsize=7.5,
            fontname="helv",
            color=(0.38, 0.45, 0.52),
        )

    document.save(output_path)
    document.close()
    return output_path
