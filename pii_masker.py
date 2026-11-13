"""Privacy-first local PII detection, deterministic per-claim token vault, and Gemini payload builder.

All PDF parsing, OCR, claim records, rules, and SQLite run locally.
Admission and discharge dates are NOT masked because they are claim-logic fields.
Masking is imperfect; it does not guarantee anonymity or DPDP compliance/certification.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple


PRIVACY_LIMITATION_NOTICE = (
    "Regex-based masking reduces obvious identifier exposure, but does not guarantee "
    "de-identification or regulatory compliance (no claim of anonymity, complete local AI "
    "processing, DPDP compliance, or DPDP certification)."
)


class ClaimTokenVault:
    """Deterministic in-memory per-claim token vault.

    Maps identical raw PII strings within the same claim to the exact same token
    (e.g. [PATIENT_NAME_1], [PHONE_1], [PATIENT_ID_1]). Never persisted to disk or logs.
    """

    def __init__(self) -> None:
        self._vaults: Dict[str, Dict[str, Any]] = {}

    def _ensure_claim(self, claim_id: str) -> Dict[str, Any]:
        if claim_id not in self._vaults:
            self._vaults[claim_id] = {
                "value_to_token": {},
                "token_to_value": {},
                "counters": {},
                "category_counts": {},
            }
        return self._vaults[claim_id]

    def get_or_create_token(self, claim_id: str, category: str, raw_value: str) -> str:
        cleaned = raw_value.strip()
        if not cleaned or cleaned.startswith("["):
            return raw_value
        vault = self._ensure_claim(claim_id)
        norm_key = f"{category}::{cleaned.lower()}"
        if norm_key in vault["value_to_token"]:
            return vault["value_to_token"][norm_key]

        idx = vault["counters"].get(category, 0) + 1
        vault["counters"][category] = idx
        vault["category_counts"][category] = idx
        token = f"[{category}_{idx}]"
        vault["value_to_token"][norm_key] = token
        vault["value_to_token"][cleaned] = token
        vault["token_to_value"][token] = cleaned
        return token

    def register_known_pii(self, claim_id: str, category: str, raw_value: str) -> str:
        return self.get_or_create_token(claim_id, category, raw_value)

    def unmask_text(self, claim_id: str, masked_text: str) -> str:
        if not masked_text or claim_id not in self._vaults:
            return masked_text
        result = masked_text
        token_map: Dict[str, str] = self._vaults[claim_id]["token_to_value"]
        for token in sorted(token_map.keys(), key=len, reverse=True):
            result = result.replace(token, token_map[token])
        return result

    def get_token_map(self, claim_id: str) -> Dict[str, str]:
        if claim_id not in self._vaults:
            return {}
        return dict(self._vaults[claim_id]["token_to_value"])

    def get_category_counts(self, claim_id: str) -> Dict[str, int]:
        if claim_id not in self._vaults:
            return {}
        return dict(self._vaults[claim_id]["category_counts"])

    def get_original_values(self, claim_id: str) -> List[str]:
        if claim_id not in self._vaults:
            return []
        return list(self._vaults[claim_id]["token_to_value"].values())

    def clear_claim(self, claim_id: str) -> None:
        self._vaults.pop(claim_id, None)


GLOBAL_TOKEN_VAULT = ClaimTokenVault()


_PATTERNS: List[Tuple[str, re.Pattern[str]]] = [
    # Labelled Patient / Person Name (fixed-width lookbehinds)
    (
        "PATIENT_NAME",
        re.compile(
            r"(?<=Patient Name:\s)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3}(?:\s*\(Synthetic\))?)"
        ),
    ),
    (
        "PATIENT_NAME",
        re.compile(
            r"(?<=Mother Name:\s)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3}(?:\s*\(Synthetic\))?)"
        ),
    ),
    (
        "PATIENT_NAME",
        re.compile(
            r"(?<=Name:\s)([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3}(?:\s*\(Synthetic\))?)"
        ),
    ),
    # Doctor names with Dr.
    (
        "DOCTOR",
        re.compile(
            r"\b(Dr\.\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z.]+){0,2}(?:\s*\(Synthetic\))?)"
        ),
    ),
    # Honorifics Mr / Mrs / Ms
    (
        "PATIENT_NAME",
        re.compile(
            r"\b((?:Mr\.|Mrs\.|Ms\.)\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}(?:\s*\(Synthetic\))?)"
        ),
    ),
    # Labelled Address
    (
        "ADDRESS",
        re.compile(r"(?<=Address:\s)(.+)"),
    ),
    # Labelled Date of Birth (Note: Admission/Discharge dates are NOT masked)
    (
        "DOB",
        re.compile(r"(?<=\bDOB:\s)(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}-[A-Za-z]{3}-\d{4})"),
    ),
    (
        "DOB",
        re.compile(r"(?<=Date of Birth:\s)(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}|\d{2}-[A-Za-z]{3}-\d{4})"),
    ),
    # Patient / Hospital IDs (UHID, MRN, PAT-)
    (
        "PATIENT_ID",
        re.compile(r"\b((?:UHID|MRN|PAT|PID)-[A-Z0-9-]{3,24})\b"),
    ),
    # Policy / Member IDs (POL-, POLICY-, MEM-)
    (
        "POLICY_ID",
        re.compile(r"\b((?:POL|POLICY|MEM)-[A-Z0-9-]{3,24})\b"),
    ),
    # Aadhaar-like 12-digit identifier
    (
        "AADHAAR",
        re.compile(r"\b(\d{4}\s\d{4}\s\d{4})\b"),
    ),
    # PAN-like identifier
    (
        "PAN",
        re.compile(r"\b([A-Z]{5}\d{4}[A-Z])\b"),
    ),
    # Email addresses
    (
        "EMAIL",
        re.compile(r"\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b"),
    ),
    # Phone numbers (Indian +91 or 10-digit mobile)
    (
        "PHONE",
        re.compile(r"(\+91[-\s]?\d{10}|\+\d{1,3}[-\s]?\d{8,12}|\b[6-9]\d{9}\b)"),
    ),
]


def mask_text(
    claim_id: str,
    text: str,
    vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
) -> str:
    """Detect and deterministically mask PII within text for a given claim."""
    if not text:
        return text

    masked = text
    for category, pattern in _PATTERNS:
        def _repl(match: re.Match[str], cat: str = category) -> str:
            raw_val = match.group(1) if match.lastindex else match.group(0)
            return vault.get_or_create_token(claim_id, cat, raw_val)

        masked = pattern.sub(_repl, masked)

    for raw_val in sorted(vault.get_original_values(claim_id), key=len, reverse=True):
        if raw_val and len(raw_val) >= 3 and raw_val in masked:
            for k, tok in vault._ensure_claim(claim_id)["value_to_token"].items():
                if k == raw_val or k.endswith(f"::{raw_val.lower()}"):
                    masked = masked.replace(raw_val, tok)
                    break

    return masked


def mask_dict(
    claim_id: str,
    payload: Dict[str, Any],
    vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
) -> Dict[str, Any]:
    """Recursively mask a dictionary before outbound requests or trace logging."""
    sensitive_keys = {
        "patient_name": "PATIENT_NAME",
        "attending_physician": "DOCTOR",
        "patient_id": "PATIENT_ID",
        "patient_reference": "PATIENT_ID",
        "policy_id": "POLICY_ID",
        "policy_number": "POLICY_ID",
        "dob": "DOB",
        "phone": "PHONE",
        "email": "EMAIL",
        "address": "ADDRESS",
    }
    unmasked_logic_keys = {"admission_date", "discharge_date", "relevant_date", "claim_type", "care_setting"}

    out: Dict[str, Any] = {}
    for k, v in payload.items():
        if v is None:
            out[k] = None
        elif k.lower() in unmasked_logic_keys:
            out[k] = v
        elif isinstance(v, str):
            if k.lower() in sensitive_keys and v.strip() and not v.startswith("["):
                out[k] = vault.get_or_create_token(claim_id, sensitive_keys[k.lower()], v)
            else:
                out[k] = mask_text(claim_id, v, vault=vault)
        elif isinstance(v, dict):
            out[k] = mask_dict(claim_id, v, vault=vault)
        elif isinstance(v, list):
            out[k] = [
                mask_dict(claim_id, item, vault=vault)
                if isinstance(item, dict)
                else (mask_text(claim_id, item, vault=vault) if isinstance(item, str) else item)
                for item in v
            ]
        else:
            out[k] = v
    return out


def redact(
    text_or_claim_id: Any,
    text_or_obj: Any = None,
    *,
    claim_id: str | None = None,
    vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
) -> Any:
    """Redact PII from text or dicts.

    Supports both:
    - redact(raw_text, claim_id="CLM-1", vault=vault) -> (masked_text, redaction_map)
    - redact(claim_id, text_or_obj, vault=vault) -> masked_obj
    """
    if claim_id is not None and text_or_obj is None:
        raw_str = str(text_or_claim_id)
        masked_str = mask_text(claim_id, raw_str, vault=vault)
        return masked_str, vault.get_token_map(claim_id)

    cid = str(text_or_claim_id or "GLOBAL")
    if isinstance(text_or_obj, str):
        return mask_text(cid, text_or_obj, vault=vault)
    if isinstance(text_or_obj, dict):
        return mask_dict(cid, text_or_obj, vault=vault)
    if isinstance(text_or_obj, list):
        return [redact(cid, x, vault=vault) for x in text_or_obj]
    return text_or_obj


def build_gemini_payload(
    claim_id: str,
    task: str,
    raw_text_or_data: Any,
    vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
) -> Dict[str, Any]:
    """Single gateway function that constructs the minimum-necessary, PII-masked payload for Gemini."""
    if isinstance(raw_text_or_data, str):
        masked_body: Any = mask_text(claim_id, raw_text_or_data, vault=vault)
    elif isinstance(raw_text_or_data, dict):
        masked_body = mask_dict(claim_id, raw_text_or_data, vault=vault)
    elif isinstance(raw_text_or_data, list):
        masked_body = [
            mask_dict(claim_id, item, vault=vault)
            if isinstance(item, dict)
            else mask_text(claim_id, str(item), vault=vault)
            for item in raw_text_or_data
        ]
    else:
        masked_body = str(raw_text_or_data)

    return {
        "task": task,
        "claim_id": claim_id,
        "privacy_mode": "MASKED_MINIMUM_NECESSARY_ONLY",
        "masked_content": masked_body,
        "redaction_summary": vault.get_category_counts(claim_id),
    }


def unmask_text(
    claim_id: str,
    masked_text: str,
    vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
) -> str:
    return vault.unmask_text(claim_id, masked_text)
