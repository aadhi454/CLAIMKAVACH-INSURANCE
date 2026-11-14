"""SQLite persistence, schema migration, synthetic policy/rule seeding, and audit logging for ClaimKavach MVP."""

from __future__ import annotations

import json
import hashlib
import os
from pathlib import Path
import secrets
import sqlite3
from typing import Any, Dict, List, Optional, Tuple
import uuid

from models import (
    AuditEntry,
    ClaimPacket,
    ExtractedDoc,
    ProvenanceField,
    RequirementSpec,
    ReviewDisposition,
    Rule,
    ToolTrace,
    ValidationFinding,
    utc_now_iso,
)
from pii_masker import GLOBAL_TOKEN_VAULT, ClaimTokenVault, redact


def get_default_db_path() -> str:
    env_db = os.environ.get("CLAIMKAVACH_DB_PATH")
    if env_db:
        return env_db
    data_dir = os.environ.get("CLAIMKAVACH_DATA_DIR", "data")
    return str(Path(data_dir) / "claimkavach.db")


DEFAULT_DB_PATH = get_default_db_path()
DEMO_API_KEY = "ck_test_demo_claimkavach_2026"

SYNTHETIC_POLICY_CONFIGS: List[Dict[str, str]] = [
    {
        "insurer": "Fictional Insurer A",
        "policy_code": "A1",
        "policy_name": "Policy A1 — Synthetic Gold Care (SYNTHETIC DEMO DATA)",
    },
    {
        "insurer": "Fictional Insurer A",
        "policy_code": "A2",
        "policy_name": "Policy A2 — Synthetic Essential Shield (SYNTHETIC DEMO DATA)",
    },
    {
        "insurer": "Fictional Insurer B",
        "policy_code": "B1",
        "policy_name": "Policy B1 — Synthetic Metro Plan (SYNTHETIC DEMO DATA)",
    },
    {
        "insurer": "Fictional Insurer B",
        "policy_code": "B2",
        "policy_name": "Policy B2 — Synthetic Prime Cover (SYNTHETIC DEMO DATA)",
    },
]


def get_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """Initialize SQLite schema with schema_version table and seed the 4 fictional policy configurations on first run."""
    with get_connection(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS policy_configs (
                insurer TEXT NOT NULL,
                policy_code TEXT PRIMARY KEY,
                policy_name TEXT NOT NULL,
                is_synthetic INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS claims (
                claim_id TEXT PRIMARY KEY,
                insurer TEXT NOT NULL,
                policy_code TEXT NOT NULL,
                claim_type TEXT NOT NULL,
                relevant_date TEXT NOT NULL,
                care_setting TEXT NOT NULL DEFAULT 'inpatient',
                diagnosis TEXT NOT NULL DEFAULT '',
                estimated_amount TEXT NOT NULL DEFAULT '',
                patient_reference TEXT NOT NULL DEFAULT '',
                patient_name TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'DRAFT',
                latest_fingerprint TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                doc_id TEXT PRIMARY KEY,
                claim_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                local_path TEXT,
                document_type TEXT NOT NULL,
                subtype TEXT,
                confidence REAL NOT NULL DEFAULT 0.0,
                processing_mode TEXT NOT NULL,
                source_metadata_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS extracted_fields (
                field_id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL,
                claim_id TEXT NOT NULL,
                field_name TEXT NOT NULL,
                value TEXT,
                is_known INTEGER NOT NULL DEFAULT 0,
                source_document TEXT,
                page INTEGER,
                evidence_excerpt TEXT,
                confidence REAL NOT NULL DEFAULT 0.0,
                origin TEXT NOT NULL DEFAULT 'extracted',
                manually_confirmed INTEGER NOT NULL DEFAULT 0,
                confirmed_by TEXT,
                confirmed_at TEXT,
                FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
                FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS rules (
                rule_pk TEXT PRIMARY KEY,
                rule_id TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                insurer_id TEXT,
                insurer TEXT NOT NULL,
                policy_code TEXT,
                claim_type TEXT NOT NULL,
                rule_type TEXT NOT NULL DEFAULT 'document_required',
                description TEXT NOT NULL,
                conditions_json TEXT NOT NULL,
                requirements_json TEXT NOT NULL DEFAULT '[]',
                required_documents_json TEXT NOT NULL,
                required_fields_json TEXT NOT NULL,
                severity TEXT NOT NULL,
                effective_start TEXT NOT NULL,
                effective_end TEXT NOT NULL,
                approval_state TEXT NOT NULL,
                source_reference TEXT NOT NULL,
                approver TEXT,
                approved_at TEXT,
                is_synthetic INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                UNIQUE(rule_id, version)
            );

            CREATE TABLE IF NOT EXISTS insurers (
                id TEXT PRIMARY KEY,
                company_name TEXT NOT NULL,
                insurer_code TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS insurer_policies (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                insurer_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(insurer_id, name),
                FOREIGN KEY (insurer_id) REFERENCES insurers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS dispatched_claims (
                id TEXT PRIMARY KEY,
                claim_ref TEXT NOT NULL,
                hospital_name TEXT NOT NULL,
                insurer_id TEXT NOT NULL,
                policy_name TEXT NOT NULL,
                diagnosis TEXT NOT NULL,
                masked_patient_summary TEXT NOT NULL,
                rule_audit_json TEXT NOT NULL,
                fhir_bundle_json TEXT NOT NULL,
                payer_status TEXT NOT NULL CHECK(payer_status IN ('RECEIVED', 'APPROVED', 'QUERY_RAISED')),
                dispatched_at TEXT NOT NULL,
                FOREIGN KEY (insurer_id) REFERENCES insurers(id)
            );

            CREATE TABLE IF NOT EXISTS validation_runs (
                run_id TEXT PRIMARY KEY,
                claim_id TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                created_at TEXT NOT NULL,
                summary_json TEXT NOT NULL,
                FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS findings (
                finding_id TEXT PRIMARY KEY,
                claim_id TEXT NOT NULL,
                validation_run_id TEXT NOT NULL DEFAULT 'RUN-DEFAULT',
                status TEXT NOT NULL,
                evidence_state TEXT NOT NULL DEFAULT 'PRESENT',
                rule_id TEXT NOT NULL,
                rule_version INTEGER NOT NULL DEFAULT 1,
                source_reference TEXT NOT NULL,
                check_type TEXT NOT NULL,
                issue TEXT NOT NULL DEFAULT '',
                reason TEXT NOT NULL,
                recommended_action TEXT NOT NULL DEFAULT '',
                evidence_references_json TEXT NOT NULL,
                review_disposition_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tool_traces (
                trace_id TEXT PRIMARY KEY,
                claim_id TEXT NOT NULL,
                turn_index INTEGER NOT NULL,
                tool TEXT NOT NULL,
                reason TEXT NOT NULL,
                redacted_input_summary TEXT NOT NULL,
                redacted_output_summary TEXT NOT NULL,
                mode TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                audit_id TEXT PRIMARY KEY,
                claim_id TEXT,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                redacted_details TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                hospital_name TEXT NOT NULL,
                hms_provider TEXT NOT NULL,
                hms_system TEXT NOT NULL DEFAULT '',
                key_prefix TEXT NOT NULL,
                key_hash TEXT NOT NULL UNIQUE,
                environment TEXT NOT NULL CHECK(environment IN ('sandbox', 'production')),
                requests_count INTEGER NOT NULL DEFAULT 0,
                last_used_at TEXT,
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS api_request_logs (
                id TEXT PRIMARY KEY,
                api_key_id TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                insurer_id TEXT NOT NULL,
                diagnosis_code TEXT NOT NULL,
                verdict TEXT NOT NULL CHECK(verdict IN ('PASS', 'BLOCKED')),
                latency_ms INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
            );
            """
        )

        # Ensure migrations are applied gracefully on existing databases
        cursor = conn.execute("PRAGMA table_info(claims);")
        columns = [row["name"] for row in cursor.fetchall()]
        if "care_setting" not in columns:
            conn.execute("ALTER TABLE claims ADD COLUMN care_setting TEXT NOT NULL DEFAULT 'inpatient'")
            conn.commit()
        if "estimated_amount" not in columns:
            conn.execute("ALTER TABLE claims ADD COLUMN estimated_amount TEXT NOT NULL DEFAULT ''")
            conn.commit()
        rule_columns = [row["name"] for row in conn.execute("PRAGMA table_info(rules);").fetchall()]
        if "insurer_id" not in rule_columns:
            conn.execute("ALTER TABLE rules ADD COLUMN insurer_id TEXT REFERENCES insurers(id)")
            conn.commit()
        api_key_columns = [row["name"] for row in conn.execute("PRAGMA table_info(api_keys);").fetchall()]
        if "hms_system" not in api_key_columns:
            conn.execute("ALTER TABLE api_keys ADD COLUMN hms_system TEXT NOT NULL DEFAULT ''")
            conn.execute("UPDATE api_keys SET hms_system = hms_provider WHERE hms_system = ''")
            conn.commit()

        conn.execute(
            """
            INSERT OR IGNORE INTO insurers (id, company_name, insurer_code, email, password, created_at)
            VALUES ('insurer-star-health-demo', 'Star Health Demo', 'INS-STAR-01', 'payer@starhealth.in', 'demo123', ?)
            """,
            (utc_now_iso(),),
        )
        conn.executemany(
            """
            INSERT OR IGNORE INTO insurer_policies (id, name, insurer_id, created_at)
            VALUES (?, ?, 'insurer-star-health-demo', ?)
            """,
            [
                ("policy-star-comprehensive", "Star Comprehensive Health Shield", utc_now_iso()),
                ("policy-star-family", "Star Family Health Optima", utc_now_iso()),
            ],
        )
        for insurer_row in conn.execute("SELECT id, company_name FROM insurers").fetchall():
            has_policy = conn.execute(
                "SELECT 1 FROM insurer_policies WHERE insurer_id = ? LIMIT 1",
                (insurer_row["id"],),
            ).fetchone()
            if not has_policy:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO insurer_policies (id, name, insurer_id, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        f"policy-{uuid.uuid4().hex[:16]}",
                        f"{insurer_row['company_name']} Comprehensive Plan",
                        insurer_row["id"],
                        utc_now_iso(),
                    ),
                )

        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?)",
            (utc_now_iso(),),
        )
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (4, ?)",
            (utc_now_iso(),),
        )
        demo_hash = hashlib.sha256(DEMO_API_KEY.encode("utf-8")).hexdigest()
        conn.execute(
            """
            INSERT OR IGNORE INTO api_keys
                (id, hospital_name, hms_provider, hms_system, key_prefix, key_hash, environment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'sandbox', ?)
            """,
            (
                "demo-claimkavach-sandbox",
                "Manipal Hospital - Whitefield Desk",
                "Custom Hospital ERP",
                "Custom Hospital ERP",
                "ck_test_demo",
                demo_hash,
                utc_now_iso(),
            ),
        )

        row = conn.execute("SELECT COUNT(*) AS cnt FROM policy_configs").fetchone()
        if row and row["cnt"] == 0:
            for cfg in SYNTHETIC_POLICY_CONFIGS:
                conn.execute(
                    """
                    INSERT INTO policy_configs (insurer, policy_code, policy_name, is_synthetic)
                    VALUES (?, ?, ?, 1)
                    """,
                    (cfg["insurer"], cfg["policy_code"], cfg["policy_name"]),
                )
            _seed_initial_rules(conn)
            conn.execute(
                """
                INSERT INTO audit_logs (audit_id, claim_id, actor, action, timestamp, redacted_details)
                VALUES (?, NULL, 'SYSTEM_INIT', 'SEED_SYNTHETIC_RULES', ?, 'Seeded 4 fictional policy configurations (A1, A2, B1, B2) and synthetic demo rules.')
                """,
                (f"AUD-{uuid.uuid4().hex[:10]}", utc_now_iso()),
            )
            conn.commit()


def create_api_key(
    hospital_name: str,
    hms_provider: str,
    environment: str,
    db_path: str = DEFAULT_DB_PATH,
) -> Dict[str, Any]:
    """Create an API credential and return the raw secret only to the caller."""
    if environment not in {"sandbox", "production"}:
        raise ValueError("environment must be 'sandbox' or 'production'.")
    if not hospital_name.strip() or not hms_provider.strip():
        raise ValueError("hospital_name and hms_provider are required.")

    token_prefix = "ck_live_" if environment == "production" else "ck_test_"
    raw_key = token_prefix + secrets.token_hex(32)
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    key_id = str(uuid.uuid4())
    created_at = utc_now_iso()
    key_prefix = raw_key[:12]
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO api_keys
                (id, hospital_name, hms_provider, hms_system, key_prefix, key_hash, environment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                key_id,
                hospital_name.strip(),
                hms_provider.strip(),
                hms_provider.strip(),
                key_prefix,
                key_hash,
                environment,
                created_at,
            ),
        )
    return {
        "id": key_id,
        "hospital_name": hospital_name.strip(),
        "hms_provider": hms_provider.strip(),
        "hms_system": hms_provider.strip(),
        "environment": environment,
        "key_prefix": key_prefix,
        "api_key": raw_key,
        "requests_count": 0,
        "last_used_at": None,
        "status": "active",
        "created_at": created_at,
    }


def get_demo_api_key(db_path: str = DEFAULT_DB_PATH) -> Dict[str, Any]:
    with get_connection(db_path) as conn:
        row = conn.execute(
            """
            SELECT id, hospital_name, hms_provider, hms_system, key_prefix,
                   environment, requests_count, last_used_at, status, created_at
            FROM api_keys
            WHERE id = 'demo-claimkavach-sandbox'
            """
        ).fetchone()
    if not row:
        raise ValueError("The demo sandbox API key is not initialized.")
    return {**dict(row), "api_key": DEMO_API_KEY}


def list_api_keys(db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, hospital_name, hms_provider, hms_system, key_prefix, environment,
                   requests_count, last_used_at, status, created_at
            FROM api_keys
            ORDER BY created_at DESC
            """
        ).fetchall()
    return [
        {
            **dict(row),
            "masked_prefix": f"{row['key_prefix']}{'•' * 12}",
        }
        for row in rows
    ]


def revoke_api_key(key_id: str, db_path: str = DEFAULT_DB_PATH) -> bool:
    with get_connection(db_path) as conn:
        cursor = conn.execute("UPDATE api_keys SET status = 'revoked' WHERE id = ?", (key_id,))
        return cursor.rowcount == 1


def authenticate_api_key(raw_key: str, db_path: str = DEFAULT_DB_PATH) -> Optional[Dict[str, Any]]:
    if not raw_key or len(raw_key) > 256:
        return None
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    now = utc_now_iso()
    with get_connection(db_path) as conn:
        row = conn.execute(
            """
            SELECT id, hospital_name, hms_provider, environment, status
            FROM api_keys
            WHERE key_hash = ? AND status = 'active'
            """,
            (key_hash,),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            """
            UPDATE api_keys
            SET requests_count = requests_count + 1, last_used_at = ?
            WHERE id = ?
            """,
            (now, row["id"]),
        )
    return dict(row)


def log_api_request(
    api_key_id: str,
    endpoint: str,
    insurer_id: str,
    diagnosis_code: str,
    verdict: str,
    latency_ms: int,
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    if verdict not in {"PASS", "BLOCKED"}:
        raise ValueError("API request verdict must be PASS or BLOCKED.")
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO api_request_logs
                (id, api_key_id, endpoint, insurer_id, diagnosis_code, verdict, latency_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                api_key_id,
                endpoint,
                insurer_id,
                diagnosis_code,
                verdict,
                max(0, int(latency_ms)),
                utc_now_iso(),
            ),
        )


def _seed_initial_rules(conn: sqlite3.Connection) -> None:
    now = utc_now_iso()
    initial_rules: List[Rule] = [
        # Core baseline rules for Policy A1, A2, B1, B2
        Rule(
            rule_id="RULE-A1-DOC-CORE",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="A1",
            claim_type="*",
            rule_type="document_required",
            description="Requires Clinical Summary, Investigation Report, Discharge Summary, and Itemized Estimate for document completeness.",
            conditions=[],
            required_documents=[
                "clinical_summary",
                "investigation_report",
                "discharge_summary",
                "itemized_estimate",
            ],
            required_fields=[],
            severity="critical",
            effective_from="2025-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-RULE-A1-DOC-CORE (SYNTHETIC DEMO DATA — not a real insurer document)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        Rule(
            rule_id="RULE-A1-FLD-ID",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="A1",
            claim_type="*",
            rule_type="field_required",
            description="Requires patient identifier, policy number, admission date, discharge date, primary diagnosis, and total estimated amount.",
            conditions=[],
            required_documents=[],
            required_fields=[
                "patient_id",
                "policy_id",
                "admission_date",
                "discharge_date",
                "primary_diagnosis",
                "total_estimated_amount",
            ],
            severity="critical",
            effective_from="2025-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-RULE-A1-FLD-ID (SYNTHETIC DEMO DATA — not a real insurer document)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        # Dengue condition-specific rules per policy (R-DEN-01, R-DEN-02, R-DEN-B1)
        Rule(
            rule_id="R-DEN-01",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="A1",
            claim_type="*",
            rule_type="document_required",
            description="Dengue completeness check (Policy A1): requires clinical summary/admission note, CBC with platelet count, Dengue NS1/IgM serology result, and itemized estimate.",
            conditions=["dengue", "ns1", "a90"],
            requirements=[
                RequirementSpec(
                    evidence_key="dengue_clinical_note",
                    label="Clinical Summary or Admission Note",
                    kind="document",
                    accepted_doc_types=["clinical_summary", "admission_note"],
                ),
                RequirementSpec(
                    evidence_key="dengue_cbc_platelet",
                    label="CBC Report with Platelet Count Result",
                    kind="document",
                    accepted_doc_types=["investigation_report"],
                    content_patterns=["platelet", "cbc"],
                    result_patterns=[r"\d+[,\d]*\s*/ul", "platelet count:"],
                ),
                RequirementSpec(
                    evidence_key="dengue_serology_result",
                    label="Dengue Serology (NS1 Antigen or IgM) with Confirmed Result",
                    kind="document",
                    accepted_doc_types=["investigation_report"],
                    content_patterns=["ns1", "igm", "dengue"],
                    result_patterns=["positive", "negative", "reactive", "units", "index"],
                ),
                RequirementSpec(
                    evidence_key="dengue_itemized_estimate",
                    label="Itemized Estimate with Line Items",
                    kind="document",
                    accepted_doc_types=["itemized_estimate", "estimate"],
                    require_itemized=True,
                ),
            ],
            required_documents=["clinical_summary", "investigation_report", "itemized_estimate"],
            required_fields=["patient_id", "admission_date", "primary_diagnosis"],
            severity="critical",
            effective_from="2026-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-R-DEN-01 (SYNTHETIC DEMO DATA — not a real insurer or regulator document)",
            unverified_icd_label="A90 (unverified reference label only)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        Rule(
            rule_id="R-DEN-02",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="A2",
            claim_type="*",
            rule_type="document_required",
            description="Dengue completeness check (Policy A2): requires clinical summary/admission note and Dengue serology (NS1 or IgM) with a result (estimate not required under A2).",
            conditions=["dengue", "ns1", "a90"],
            requirements=[
                RequirementSpec(
                    evidence_key="dengue_clinical_note",
                    label="Clinical Summary or Admission Note",
                    kind="document",
                    accepted_doc_types=["clinical_summary", "admission_note"],
                ),
                RequirementSpec(
                    evidence_key="dengue_serology_result",
                    label="Dengue Serology (NS1 or IgM) with Confirmed Result",
                    kind="document",
                    accepted_doc_types=["investigation_report"],
                    content_patterns=["ns1", "igm", "dengue"],
                    result_patterns=["positive", "negative", "reactive", "units", "index"],
                ),
            ],
            required_documents=["clinical_summary", "investigation_report"],
            required_fields=["patient_id", "primary_diagnosis"],
            severity="critical",
            effective_from="2026-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-R-DEN-02 (SYNTHETIC DEMO DATA — not a real insurer or regulator document)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        Rule(
            rule_id="R-DEN-B1",
            version=1,
            insurer="Fictional Insurer B",
            policy_code="B1",
            claim_type="*",
            rule_type="document_required",
            description="Dengue completeness check (Insurer B / Policy B1): requires clinical summary, CBC with platelet count, Dengue serology result, and photo ID proof.",
            conditions=["dengue", "ns1", "a90"],
            requirements=[
                RequirementSpec(
                    evidence_key="dengue_clinical_note",
                    label="Clinical Summary or Admission Note",
                    kind="document",
                    accepted_doc_types=["clinical_summary", "admission_note"],
                ),
                RequirementSpec(
                    evidence_key="dengue_cbc_platelet",
                    label="CBC Report with Platelet Count",
                    kind="document",
                    accepted_doc_types=["investigation_report"],
                    content_patterns=["platelet", "cbc"],
                    result_patterns=[r"\d+[,\d]*\s*/ul", "platelet count:"],
                ),
                RequirementSpec(
                    evidence_key="dengue_serology_result",
                    label="Dengue Serology with Confirmed Result",
                    kind="document",
                    accepted_doc_types=["investigation_report"],
                    content_patterns=["ns1", "igm", "dengue"],
                    result_patterns=["positive", "negative", "reactive"],
                ),
                RequirementSpec(
                    evidence_key="photo_id_proof",
                    label="Photo ID Proof (Presence Only)",
                    kind="document",
                    accepted_doc_types=["id_proof"],
                ),
            ],
            required_documents=["clinical_summary", "investigation_report", "id_proof"],
            required_fields=["patient_id", "admission_date"],
            severity="critical",
            effective_from="2026-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-R-DEN-B1 (SYNTHETIC DEMO DATA — not a real insurer or regulator document)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        # Additional condition-specific rules from rulebook
        Rule(
            rule_id="R-CAT-01",
            version=1,
            insurer="Fictional Insurer B",
            policy_code="*",
            claim_type="*",
            rule_type="document_required",
            description="Cataract completeness check: ophthalmology consultation note, A-scan biometry report, and IOL barcode sticker/invoice.",
            conditions=["cataract", "h25"],
            required_documents=["consultation_note", "investigation_report", "implant_record"],
            required_fields=["patient_id", "primary_diagnosis"],
            severity="critical",
            effective_from="2026-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-R-CAT-01 (SYNTHETIC DEMO DATA — not a real insurer document)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        Rule(
            rule_id="R-ACC-01",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="*",
            claim_type="*",
            rule_type="document_required",
            description="Trauma/Accident completeness check: ER triage/admission note, X-ray/CT imaging report, and medico-legal certificate or FIR copy.",
            conditions=["accident", "trauma", "polytrauma", "fracture", "rta"],
            required_documents=["admission_note", "investigation_report", "medico_legal"],
            required_fields=["patient_id", "admission_date"],
            severity="critical",
            effective_from="2026-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-R-ACC-01 (SYNTHETIC DEMO DATA — not a real insurer document)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        Rule(
            rule_id="R-APP-01",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="*",
            claim_type="*",
            rule_type="document_required",
            description="Appendicitis completeness check: admission evaluation, ultrasound/CT report, OT notes, and histopathology report.",
            conditions=["appendicitis", "appendectomy"],
            required_documents=["admission_note", "investigation_report", "ot_notes", "histopathology"],
            required_fields=["patient_id", "admission_date"],
            severity="critical",
            effective_from="2026-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-R-APP-01 (SYNTHETIC DEMO DATA — not a real insurer document)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        Rule(
            rule_id="R-DIS-01",
            version=1,
            insurer="*",
            policy_code="*",
            claim_type="Final Discharge",
            rule_type="document_required",
            description="Final Discharge completeness check: discharge summary, itemized final bill, and photo ID proof.",
            conditions=[],
            required_documents=["discharge_summary", "final_bill", "id_proof"],
            required_fields=["patient_id", "admission_date", "discharge_date"],
            severity="critical",
            effective_from="2026-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-R-DIS-01 (SYNTHETIC DEMO DATA — not a real insurer document)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        # Draft unapproved rule on A1 (must never execute until approved)
        Rule(
            rule_id="RULE-A1-DRAFT-EXPERIMENTAL",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="A1",
            claim_type="*",
            description="Draft unapproved rule requiring genomic sequencing report (must never execute until approved).",
            conditions=[],
            required_documents=["genomic_report"],
            required_fields=["genomic_marker"],
            severity="critical",
            effective_from="2025-01-01",
            effective_to="2027-12-31",
            approval_status="draft",
            source_reference="SYNTH-RULE-A1-DRAFT (SYNTHETIC DEMO DATA)",
            approver=None,
            is_synthetic=True,
            created_at=now,
        ),
        # Expired 2024 rule on A1 (excluded for 2026 claims)
        Rule(
            rule_id="RULE-A1-EXPIRED-2024",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="A1",
            claim_type="*",
            description="Historical 2024 requirement for legacy paper stamp (expired).",
            conditions=[],
            required_documents=["legacy_stamp_sheet"],
            required_fields=[],
            severity="critical",
            effective_from="2024-01-01",
            effective_to="2024-12-31",
            approval_status="approved",
            source_reference="SYNTH-RULE-A1-2024 (SYNTHETIC DEMO DATA)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        # Baseline rules for A2, B1, B2 when no specific condition keyword is entered
        Rule(
            rule_id="RULE-A2-SURGICAL-CORE",
            version=1,
            insurer="Fictional Insurer A",
            policy_code="A2",
            claim_type="Inpatient Cashless",
            description="Policy A2 baseline requires Clinical Summary, Discharge Summary, and Itemized Estimate.",
            conditions=[],
            required_documents=["clinical_summary", "discharge_summary", "itemized_estimate"],
            required_fields=["patient_id", "policy_id", "primary_diagnosis"],
            severity="critical",
            effective_from="2025-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-RULE-A2-CORE (SYNTHETIC DEMO DATA)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        Rule(
            rule_id="RULE-B1-METRO-CORE",
            version=1,
            insurer="Fictional Insurer B",
            policy_code="B1",
            claim_type="Inpatient Cashless",
            description="Policy B1 baseline requires Clinical Summary, Investigation Report, and Itemized Estimate.",
            conditions=[],
            required_documents=["clinical_summary", "investigation_report", "itemized_estimate"],
            required_fields=["patient_id", "policy_id", "admission_date", "attending_physician"],
            severity="critical",
            effective_from="2025-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-RULE-B1-CORE (SYNTHETIC DEMO DATA)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
        Rule(
            rule_id="RULE-B2-COMP-CORE",
            version=1,
            insurer="Fictional Insurer B",
            policy_code="B2",
            claim_type="Reimbursement",
            description="Policy B2 Reimbursement baseline requires all 4 core clinical/financial documents.",
            conditions=[],
            required_documents=[
                "clinical_summary",
                "investigation_report",
                "discharge_summary",
                "itemized_estimate",
            ],
            required_fields=["patient_id", "policy_id", "total_estimated_amount"],
            severity="critical",
            effective_from="2025-01-01",
            effective_to="2027-12-31",
            approval_status="approved",
            source_reference="SYNTH-RULE-B2-CORE (SYNTHETIC DEMO DATA)",
            approver="SYNTHETIC-SEED (demo)",
            is_synthetic=True,
            created_at=now,
        ),
    ]

    for r in initial_rules:
        _insert_rule_row(conn, r)


def _insert_rule_row(conn: sqlite3.Connection, rule: Rule) -> None:
    rule_pk = f"{rule.rule_id}::v{rule.version}"
    conn.execute(
        """
        INSERT INTO rules (
            rule_pk, rule_id, version, insurer, policy_code, claim_type, rule_type,
            description, conditions_json, requirements_json, required_documents_json,
            required_fields_json, severity, effective_start, effective_end,
            approval_state, source_reference, approver, approved_at, is_synthetic, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            rule_pk,
            rule.rule_id,
            rule.version,
            rule.insurer,
            rule.policy_code or "*",
            rule.claim_type,
            rule.rule_type,
            rule.description,
            json.dumps(rule.conditions),
            json.dumps([req.to_dict() for req in rule.requirements]),
            json.dumps(rule.required_documents),
            json.dumps(rule.required_fields),
            rule.severity,
            rule.effective_start,
            rule.effective_end,
            rule.approval_state,
            rule.source_reference,
            rule.approver,
            rule.approved_at,
            1 if rule.is_synthetic else 0,
            rule.created_at,
        ),
    )


def get_policy_configs(db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT insurer, policy_code, policy_name, is_synthetic FROM policy_configs ORDER BY policy_code"
        ).fetchall()
        return [
            {
                "insurer": r["insurer"],
                "policy_code": r["policy_code"],
                "policy_name": r["policy_name"],
                "is_synthetic": bool(r["is_synthetic"]),
            }
            for r in rows
        ]


def list_insurers(db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute("SELECT id, company_name, insurer_code, email, created_at FROM insurers ORDER BY company_name").fetchall()
        policy_rows = conn.execute(
            "SELECT id, name, insurer_id, created_at FROM insurer_policies ORDER BY created_at, name"
        ).fetchall()
    insurers: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        insurers[row["id"]] = {
            "id": row["id"],
            "company_name": row["company_name"],
            "insurer_code": row["insurer_code"],
            "email": row["email"],
            "created_at": row["created_at"],
            "policies": [],
        }
    for row in policy_rows:
        if row["insurer_id"] in insurers:
            insurers[row["insurer_id"]]["policies"].append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "policy_name": row["name"],
                    "insurer_id": row["insurer_id"],
                }
            )
    return list(insurers.values())


def list_insurer_policies(insurer_id: str, db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT id, name, insurer_id, created_at FROM insurer_policies WHERE insurer_id = ? ORDER BY created_at, name",
            (insurer_id,),
        ).fetchall()
    return [{**dict(row), "policy_name": row["name"]} for row in rows]


def authenticate_insurer(email: str, password: str, db_path: str = DEFAULT_DB_PATH) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT id, company_name, insurer_code, email, created_at FROM insurers WHERE lower(email) = lower(?) AND password = ?",
            (email.strip(), password),
        ).fetchone()
    return dict(row) if row else None


def create_insurer(
    company_name: str,
    insurer_code: str,
    email: str,
    password: str,
    db_path: str = DEFAULT_DB_PATH,
) -> Dict[str, Any]:
    if not all(value.strip() for value in (company_name, insurer_code, email, password)):
        raise ValueError("Company name, insurer code, email, and password are required.")
    insurer = {
        "id": f"insurer-{uuid.uuid4().hex[:16]}",
        "company_name": company_name.strip(),
        "insurer_code": insurer_code.strip().upper(),
        "email": email.strip().lower(),
        "password": password,
        "created_at": utc_now_iso(),
    }
    try:
        with get_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO insurers (id, company_name, insurer_code, email, password, created_at)
                VALUES (:id, :company_name, :insurer_code, :email, :password, :created_at)
                """,
                insurer,
            )
            conn.execute(
                """
                INSERT INTO insurer_policies (id, name, insurer_id, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    f"policy-{uuid.uuid4().hex[:16]}",
                    f"{insurer['company_name']} Comprehensive Plan",
                    insurer["id"],
                    insurer["created_at"],
                ),
            )
            conn.commit()
    except sqlite3.IntegrityError as exc:
        raise ValueError("Insurer code or email is already registered.") from exc
    insurer.pop("password")
    insurer["policies"] = list_insurer_policies(insurer["id"], db_path)
    return insurer


def create_insurer_rule(
    insurer_id: str,
    policy_name: str,
    condition: str,
    claim_type: str,
    required_documents: List[str],
    db_path: str = DEFAULT_DB_PATH,
) -> Dict[str, Any]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        insurer = conn.execute("SELECT id, company_name FROM insurers WHERE id = ?", (insurer_id,)).fetchone()
        if not insurer:
            raise ValueError("Insurer was not found.")
        if claim_type not in ("Cashless Pre-Auth", "Final Discharge"):
            raise ValueError("Claim type is invalid.")
        rule_id = f"R-{insurer_id[-8:].upper()}-{uuid.uuid4().hex[:8].upper()}"
        document_type_map = {
            "ns1 antigen report": "investigation_report",
            "dengue igm report": "investigation_report",
            "iol barcode sticker": "implant_record",
            "iol barcode sticker/invoice": "implant_record",
            "clinical summary": "clinical_summary",
            "investigation report": "investigation_report",
            "discharge summary": "discharge_summary",
            "final bill": "final_bill",
            "photo id proof": "id_proof",
            "id proof": "id_proof",
        }
        normalized_documents = [
            document_type_map.get(document.strip().lower(), document.strip())
            for document in required_documents
            if document.strip()
        ]
        conn.execute(
            """
            INSERT INTO rules (
                rule_pk, rule_id, version, insurer_id, insurer, policy_code, claim_type, rule_type,
                description, conditions_json, requirements_json, required_documents_json, required_fields_json,
                severity, effective_start, effective_end, approval_state, source_reference, approver,
                approved_at, is_synthetic, created_at
            ) VALUES (?, ?, 1, ?, ?, ?, ?, 'document_required', ?, ?, '[]', ?, '[]', 'critical',
                      '2026-01-01', '2099-12-31', 'APPROVED', ?, ?, ?, 0, ?)
            """,
            (
                f"{rule_id}::v1",
                rule_id,
                insurer_id,
                insurer["company_name"],
                policy_name.strip(),
                claim_type,
                f"{condition.strip()} requires {', '.join(normalized_documents)}",
                json.dumps([condition.strip()]),
                json.dumps(normalized_documents),
                f"INSURER-{insurer_id}",
                insurer["company_name"],
                utc_now_iso(),
                utc_now_iso(),
            ),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO insurer_policies (id, name, insurer_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (f"policy-{uuid.uuid4().hex[:16]}", policy_name.strip(), insurer_id, utc_now_iso()),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO policy_configs (insurer, policy_code, policy_name, is_synthetic)
            VALUES (?, ?, ?, 0)
            """,
            (insurer["company_name"], policy_name.strip(), policy_name.strip()),
        )
        conn.commit()
    return {
        "rule_id": rule_id,
        "insurer_id": insurer_id,
        "policy_name": policy_name.strip(),
        "condition": condition.strip(),
        "claim_type": claim_type,
        "required_documents": normalized_documents,
    }


def create_dispatched_claim(payload: Dict[str, Any], db_path: str = DEFAULT_DB_PATH) -> Dict[str, Any]:
    init_db(db_path)
    required = ("claim_ref", "hospital_name", "insurer_id", "policy_name", "diagnosis")
    if any(not str(payload.get(key) or "").strip() for key in required):
        raise ValueError("claim_ref, hospital_name, insurer_id, policy_name, and diagnosis are required.")
    claim = {
        "id": f"dispatch-{uuid.uuid4().hex[:16]}",
        "claim_ref": str(payload["claim_ref"]).strip(),
        "hospital_name": str(payload["hospital_name"]).strip(),
        "insurer_id": str(payload["insurer_id"]).strip(),
        "policy_name": str(payload["policy_name"]).strip(),
        "diagnosis": str(payload["diagnosis"]).strip(),
        "masked_patient_summary": str(payload.get("masked_patient_summary") or "[NAME_MASKED] [PHONE_MASKED]"),
        "rule_audit_json": json.dumps(payload.get("rule_audit") or [], ensure_ascii=False),
        "fhir_bundle_json": json.dumps(payload.get("fhir_bundle") or {}, ensure_ascii=False),
        "payer_status": "RECEIVED",
        "dispatched_at": utc_now_iso(),
    }
    with get_connection(db_path) as conn:
        if not conn.execute("SELECT 1 FROM insurers WHERE id = ?", (claim["insurer_id"],)).fetchone():
            raise ValueError("Insurer was not found.")
        conn.execute(
            """
            INSERT INTO dispatched_claims (
                id, claim_ref, hospital_name, insurer_id, policy_name, diagnosis,
                masked_patient_summary, rule_audit_json, fhir_bundle_json, payer_status, dispatched_at
            ) VALUES (:id, :claim_ref, :hospital_name, :insurer_id, :policy_name, :diagnosis,
                      :masked_patient_summary, :rule_audit_json, :fhir_bundle_json, :payer_status, :dispatched_at)
            """,
            claim,
        )
        conn.commit()
    return {**claim, "rule_audit": json.loads(claim["rule_audit_json"]), "fhir_bundle": json.loads(claim["fhir_bundle_json"])}


def list_dispatched_claims(insurer_id: Optional[str] = None, db_path: str = DEFAULT_DB_PATH) -> List[Dict[str, Any]]:
    init_db(db_path)
    query = "SELECT * FROM dispatched_claims"
    params: Tuple[Any, ...] = ()
    if insurer_id:
        query += " WHERE insurer_id = ?"
        params = (insurer_id,)
    query += " ORDER BY dispatched_at DESC"
    with get_connection(db_path) as conn:
        rows = conn.execute(query, params).fetchall()
    return [
        {
            **dict(row),
            "rule_audit": json.loads(row["rule_audit_json"] or "[]"),
            "fhir_bundle": json.loads(row["fhir_bundle_json"] or "{}"),
        }
        for row in rows
    ]


def update_dispatched_claim_status(claim_id: str, payer_status: str, db_path: str = DEFAULT_DB_PATH) -> Dict[str, Any]:
    if payer_status not in ("APPROVED", "QUERY_RAISED"):
        raise ValueError("Payer status must be APPROVED or QUERY_RAISED.")
    with get_connection(db_path) as conn:
        cursor = conn.execute("UPDATE dispatched_claims SET payer_status = ? WHERE id = ?", (payer_status, claim_id))
        if cursor.rowcount != 1:
            raise ValueError("Dispatched claim was not found.")
        row = conn.execute("SELECT * FROM dispatched_claims WHERE id = ?", (claim_id,)).fetchone()
        conn.commit()
    return {
        **dict(row),
        "rule_audit": json.loads(row["rule_audit_json"] or "[]"),
        "fhir_bundle": json.loads(row["fhir_bundle_json"] or "{}"),
    }


def log_audit(
    actor: str,
    action: str,
    redacted_details: str,
    claim_id: Optional[str] = None,
    db_path: str = DEFAULT_DB_PATH,
    vault: ClaimTokenVault = GLOBAL_TOKEN_VAULT,
) -> AuditEntry:
    init_db(db_path)
    safe_details = str(redact(claim_id or "GLOBAL", redacted_details, vault=vault))
    entry = AuditEntry(
        audit_id=f"AUD-{uuid.uuid4().hex[:10]}",
        claim_id=claim_id,
        actor=actor,
        action=action,
        timestamp=utc_now_iso(),
        redacted_details=safe_details,
    )
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO audit_logs (audit_id, claim_id, actor, action, timestamp, redacted_details)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                entry.audit_id,
                entry.claim_id,
                entry.actor,
                entry.action,
                entry.timestamp,
                entry.redacted_details,
            ),
        )
        conn.commit()
    return entry


def list_audit_logs(
    claim_id: Optional[str] = None,
    db_path: str = DEFAULT_DB_PATH,
) -> List[AuditEntry]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        if claim_id:
            rows = conn.execute(
                "SELECT * FROM audit_logs WHERE claim_id = ? OR claim_id IS NULL ORDER BY timestamp DESC",
                (claim_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC").fetchall()
        return [
            AuditEntry(
                audit_id=r["audit_id"],
                claim_id=r["claim_id"],
                actor=r["actor"],
                action=r["action"],
                timestamp=r["timestamp"],
                redacted_details=r["redacted_details"],
            )
            for r in rows
        ]


def _row_to_rule(r: sqlite3.Row) -> Rule:
    reqs_raw = json.loads(r["requirements_json"]) if "requirements_json" in r.keys() and r["requirements_json"] else []
    return Rule(
        rule_id=r["rule_id"],
        version=r["version"],
        insurer=r["insurer"],
        policy_code=r["policy_code"],
        claim_type=r["claim_type"],
        rule_type=r["rule_type"] if "rule_type" in r.keys() else "document_required",
        description=r["description"],
        conditions=json.loads(r["conditions_json"]),
        requirements=[RequirementSpec(**req) for req in reqs_raw],
        required_documents=json.loads(r["required_documents_json"]),
        required_fields=json.loads(r["required_fields_json"]),
        severity=r["severity"],
        effective_start=r["effective_start"],
        effective_end=r["effective_end"],
        approval_state=r["approval_state"],
        source_reference=r["source_reference"],
        approver=r["approver"],
        is_synthetic=bool(r["is_synthetic"]),
        created_at=r["created_at"],
    )


def list_rules(
    latest_only: bool = False,
    db_path: str = DEFAULT_DB_PATH,
) -> List[Rule]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        if latest_only:
            rows = conn.execute(
                """
                SELECT r.* FROM rules r
                INNER JOIN (
                    SELECT rule_id, MAX(version) AS max_ver
                    FROM rules
                    GROUP BY rule_id
                ) m ON r.rule_id = m.rule_id AND r.version = m.max_ver
                ORDER BY r.policy_code, r.rule_id
                """
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM rules ORDER BY policy_code, rule_id, version DESC"
            ).fetchall()
        return [_row_to_rule(r) for r in rows]


def create_or_version_rule(
    rule: Rule,
    actor: str = "admin_user",
    db_path: str = DEFAULT_DB_PATH,
) -> Rule:
    init_db(db_path)
    source_ref = rule.source_reference
    if "SYNTHETIC" not in source_ref.upper():
        source_ref = f"SYNTH-{rule.rule_id} (SYNTHETIC DEMO DATA - {source_ref})"

    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT MAX(version) AS max_ver FROM rules WHERE rule_id = ?",
            (rule.rule_id,),
        ).fetchone()
        next_version = (row["max_ver"] or 0) + 1
        new_rule = Rule(
            rule_id=rule.rule_id,
            version=next_version,
            insurer=rule.insurer,
            policy_code=rule.policy_code,
            claim_type=rule.claim_type,
            rule_type=rule.rule_type,
            description=rule.description,
            conditions=rule.conditions,
            requirements=rule.requirements,
            required_documents=rule.required_documents,
            required_fields=rule.required_fields,
            severity=rule.severity,
            effective_start=rule.effective_start,
            effective_end=rule.effective_end,
            approval_state=rule.approval_state,
            source_reference=source_ref,
            approver=rule.approver if rule.approval_state == "APPROVED" else None,
            is_synthetic=True,
            created_at=utc_now_iso(),
        )
        _insert_rule_row(conn, new_rule)
        conn.commit()

    log_audit(
        actor=actor,
        action="RULE_VERSION_CREATED",
        redacted_details=f"Saved rule {new_rule.rule_id} v{new_rule.version} ({new_rule.approval_state}) for policy {new_rule.policy_code}",
        db_path=db_path,
    )
    return new_rule


def set_rule_approval_state(
    rule_id: str,
    new_state: str,
    actor: str = "admin_approver",
    db_path: str = DEFAULT_DB_PATH,
) -> Rule:
    norm_state = new_state.upper()
    if norm_state not in ("APPROVED", "DEACTIVATED", "DRAFT"):
        raise ValueError(f"Invalid rule approval state: {new_state}")
    if norm_state == "APPROVED" and (not actor or not actor.strip()):
        raise ValueError("Approver name is required to approve a rule.")

    init_db(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM rules WHERE rule_id = ? ORDER BY version DESC LIMIT 1",
            (rule_id,),
        ).fetchone()
        if not row:
            raise ValueError(f"Rule {rule_id} not found")
        current = _row_to_rule(row)

    updated = Rule(
        rule_id=current.rule_id,
        version=current.version + 1,
        insurer=current.insurer,
        policy_code=current.policy_code,
        claim_type=current.claim_type,
        rule_type=current.rule_type,
        description=current.description,
        conditions=current.conditions,
        requirements=current.requirements,
        required_documents=current.required_documents,
        required_fields=current.required_fields,
        severity=current.severity,
        effective_start=current.effective_start,
        effective_end=current.effective_end,
        approval_state=norm_state,
        source_reference=current.source_reference,
        approver=actor.strip() if norm_state == "APPROVED" else current.approver,
        is_synthetic=True,
        created_at=utc_now_iso(),
    )
    with get_connection(db_path) as conn:
        _insert_rule_row(conn, updated)
        conn.commit()

    log_audit(
        actor=actor.strip(),
        action=f"RULE_{norm_state}",
        redacted_details=f"Rule {updated.rule_id} transitioned to {norm_state} at version v{updated.version}",
        db_path=db_path,
    )
    return updated


def save_claim(
    claim: ClaimPacket,
    actor: str = "billing_clerk",
    db_path: str = DEFAULT_DB_PATH,
) -> ClaimPacket:
    init_db(db_path)
    now = utc_now_iso()
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO claims (
                claim_id, insurer, policy_code, claim_type, relevant_date,
                care_setting, diagnosis, patient_reference, patient_name,
                estimated_amount, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(claim_id) DO UPDATE SET
                insurer = excluded.insurer,
                policy_code = excluded.policy_code,
                claim_type = excluded.claim_type,
                relevant_date = excluded.relevant_date,
                care_setting = excluded.care_setting,
                diagnosis = excluded.diagnosis,
                estimated_amount = excluded.estimated_amount,
                patient_reference = excluded.patient_reference,
                patient_name = excluded.patient_name,
                status = excluded.status,
                updated_at = excluded.updated_at
            """,
            (
                claim.claim_id,
                claim.insurer,
                claim.policy_code,
                claim.claim_type,
                claim.relevant_date,
                claim.care_setting,
                claim.diagnosis,
                claim.patient_reference,
                claim.patient_name,
                claim.estimated_amount,
                claim.status,
                claim.created_at or now,
                now,
            ),
        )
        conn.commit()

    log_audit(
        actor=actor,
        action="SAVE_CLAIM",
        redacted_details=(
            f"Saved claim {claim.claim_id} ({claim.insurer} / {claim.policy_code} / "
            f"{claim.claim_type} / diag='{claim.diagnosis}' on {claim.relevant_date})"
        ),
        claim_id=claim.claim_id,
        db_path=db_path,
    )
    return get_claim(claim.claim_id, db_path=db_path)  # type: ignore[return-value]


def clear_claim_documents(claim_id: str, db_path: str = DEFAULT_DB_PATH) -> None:
    init_db(db_path)
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM extracted_fields WHERE claim_id = ?", (claim_id,))
        conn.execute("DELETE FROM documents WHERE claim_id = ?", (claim_id,))
        conn.commit()


def remove_claim_document(claim_id: str, doc_id: str, db_path: str = DEFAULT_DB_PATH) -> None:
    init_db(db_path)
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM extracted_fields WHERE doc_id = ? AND claim_id = ?", (doc_id, claim_id))
        conn.execute("DELETE FROM documents WHERE doc_id = ? AND claim_id = ?", (doc_id, claim_id))
        conn.commit()


def save_extracted_doc(
    doc: ExtractedDoc,
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    init_db(db_path)
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO documents (
                doc_id, claim_id, filename, local_path, document_type, subtype,
                confidence, processing_mode, source_metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(doc_id) DO UPDATE SET
                filename = excluded.filename,
                local_path = excluded.local_path,
                document_type = excluded.document_type,
                subtype = excluded.subtype,
                confidence = excluded.confidence,
                processing_mode = excluded.processing_mode,
                source_metadata_json = excluded.source_metadata_json
            """,
            (
                doc.doc_id,
                doc.claim_id,
                doc.filename,
                doc.local_path,
                doc.document_type,
                doc.subtype,
                doc.confidence,
                doc.processing_mode,
                json.dumps(doc.source_metadata),
                doc.created_at,
            ),
        )
        conn.execute("DELETE FROM extracted_fields WHERE doc_id = ?", (doc.doc_id,))
        field_dict = doc.extracted_fields or doc.fields
        for fname, pf in field_dict.items():
            field_id = f"{doc.doc_id}::{fname}"
            conn.execute(
                """
                INSERT INTO extracted_fields (
                    field_id, doc_id, claim_id, field_name, value, is_known,
                    source_document, page, evidence_excerpt, confidence, origin,
                    manually_confirmed, confirmed_by, confirmed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    field_id,
                    doc.doc_id,
                    doc.claim_id,
                    pf.field_name or fname,
                    pf.value,
                    1 if pf.is_known else 0,
                    pf.source_document or doc.filename,
                    pf.page,
                    pf.evidence_excerpt,
                    pf.confidence,
                    "human_confirmed" if pf.manually_confirmed else pf.origin,
                    1 if pf.manually_confirmed else 0,
                    pf.confirmed_by,
                    pf.confirmed_at,
                ),
            )
        conn.commit()


def get_claim_documents(claim_id: str, db_path: str = DEFAULT_DB_PATH) -> List[ExtractedDoc]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        doc_rows = conn.execute(
            "SELECT * FROM documents WHERE claim_id = ? ORDER BY filename",
            (claim_id,),
        ).fetchall()
        docs: List[ExtractedDoc] = []
        for dr in doc_rows:
            f_rows = conn.execute(
                "SELECT * FROM extracted_fields WHERE doc_id = ?",
                (dr["doc_id"],),
            ).fetchall()
            fields_map: Dict[str, ProvenanceField] = {}
            for fr in f_rows:
                fields_map[fr["field_name"]] = ProvenanceField(
                    field_name=fr["field_name"],
                    value=fr["value"],
                    is_known=bool(fr["is_known"]),
                    source_document=fr["source_document"],
                    page=fr["page"],
                    evidence_excerpt=fr["evidence_excerpt"],
                    confidence=float(fr["confidence"]),
                    origin=fr["origin"] if "origin" in fr.keys() else "extracted",
                    manually_confirmed=bool(fr["manually_confirmed"]),
                    confirmed_by=fr["confirmed_by"],
                    confirmed_at=fr["confirmed_at"],
                )
            docs.append(
                ExtractedDoc(
                    doc_id=dr["doc_id"],
                    claim_id=dr["claim_id"],
                    filename=dr["filename"],
                    local_path=dr["local_path"],
                    document_type=dr["document_type"],
                    subtype=dr["subtype"] if "subtype" in dr.keys() else None,
                    fields=fields_map,
                    extracted_fields=fields_map,
                    confidence=float(dr["confidence"]),
                    processing_mode=dr["processing_mode"],
                    source_metadata=json.loads(dr["source_metadata_json"]),
                    created_at=dr["created_at"],
                )
            )
        return docs


def get_claim(claim_id: str, db_path: str = DEFAULT_DB_PATH) -> Optional[ClaimPacket]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM claims WHERE claim_id = ?", (claim_id,)).fetchone()
        if not row:
            return None
    docs = get_claim_documents(claim_id, db_path=db_path)
    return ClaimPacket(
        claim_id=row["claim_id"],
        insurer=row["insurer"],
        policy_code=row["policy_code"],
        claim_type=row["claim_type"],
        relevant_date=row["relevant_date"],
        care_setting=row["care_setting"] if "care_setting" in row.keys() else "inpatient",
        diagnosis=row["diagnosis"] if "diagnosis" in row.keys() else "",
        estimated_amount=row["estimated_amount"] if "estimated_amount" in row.keys() else "",
        patient_reference=row["patient_reference"] if "patient_reference" in row.keys() else "",
        patient_name=row["patient_name"] if "patient_name" in row.keys() else "",
        status=row["status"],
        document_refs=[d.doc_id for d in docs],
        documents=docs,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_claims(db_path: str = DEFAULT_DB_PATH) -> List[ClaimPacket]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute("SELECT claim_id FROM claims ORDER BY updated_at DESC").fetchall()
    out: List[ClaimPacket] = []
    for r in rows:
        c = get_claim(r["claim_id"], db_path=db_path)
        if c:
            out.append(c)
    return out


def update_extracted_field_by_reviewer(
    claim_id: str,
    doc_id: str,
    field_name: str,
    new_value: str,
    reviewer: str,
    rationale: str,
    page: int = 1,
    evidence_excerpt: Optional[str] = None,
    db_path: str = DEFAULT_DB_PATH,
) -> ProvenanceField:
    if not reviewer or not reviewer.strip():
        raise ValueError("Reviewer name is required to confirm or correct an extracted field.")
    if not rationale or not rationale.strip():
        raise ValueError("Reviewer rationale is required.")

    init_db(db_path)
    now = utc_now_iso()
    docs = get_claim_documents(claim_id, db_path=db_path)
    target_doc = next((d for d in docs if d.doc_id == doc_id), None)
    if not target_doc:
        raise ValueError(f"Document {doc_id} not found for claim {claim_id}")

    existing = target_doc.extracted_fields.get(field_name)
    excerpt = evidence_excerpt or (
        existing.evidence_excerpt if existing else f"Human confirmed value in {target_doc.filename} p.{page}"
    )
    updated_pf = ProvenanceField(
        field_name=field_name,
        value=new_value.strip(),
        is_known=bool(new_value.strip()),
        source_document=target_doc.filename,
        page=existing.page if (existing and existing.page) else page,
        evidence_excerpt=excerpt,
        confidence=1.0 if new_value.strip() else 0.0,
        origin="human_confirmed",
        manually_confirmed=True,
        confirmed_by=reviewer.strip(),
        confirmed_at=now,
    )
    target_doc.extracted_fields[field_name] = updated_pf
    target_doc.fields[field_name] = updated_pf
    save_extracted_doc(target_doc, db_path=db_path)

    log_audit(
        actor=reviewer.strip(),
        action="HUMAN_FIELD_CONFIRMATION",
        redacted_details=f"Confirmed/updated field '{field_name}' in {target_doc.filename} p.{updated_pf.page} (Rationale: {rationale.strip()})",
        claim_id=claim_id,
        db_path=db_path,
    )
    return updated_pf


def save_findings(
    claim_id: str,
    findings: List[ValidationFinding],
    preserve_dispositions: bool = True,
    fingerprint: str = "",
    run_fingerprint: str = "",
    db_path: str = DEFAULT_DB_PATH,
) -> List[ValidationFinding]:
    init_db(db_path)
    fingerprint = run_fingerprint or fingerprint
    run_id = f"RUN-{uuid.uuid4().hex[:8]}"
    existing_dispositions: Dict[Tuple[str, str, str], ReviewDisposition] = {}
    if preserve_dispositions:
        for old_f in get_findings(claim_id, db_path=db_path):
            if old_f.status == "REVIEW" and old_f.review_disposition is not None:
                existing_dispositions[(old_f.rule_id, old_f.check_type, old_f.reason)] = old_f.review_disposition

    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO validation_runs (run_id, claim_id, fingerprint, created_at, summary_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                run_id,
                claim_id,
                fingerprint,
                utc_now_iso(),
                json.dumps(
                    {
                        "pass": sum(1 for f in findings if f.status == "PASS"),
                        "fail": sum(1 for f in findings if f.status == "FAIL"),
                        "review": sum(1 for f in findings if f.status == "REVIEW"),
                    }
                ),
            ),
        )
        conn.execute("UPDATE claims SET latest_fingerprint = ? WHERE claim_id = ?", (fingerprint, claim_id))
        conn.execute("DELETE FROM findings WHERE claim_id = ?", (claim_id,))
        for f in findings:
            if f.status == "REVIEW" and f.review_disposition is None:
                disp = existing_dispositions.get((f.rule_id, f.check_type, f.reason))
                if disp:
                    f.review_disposition = disp

            disp_json = (
                json.dumps(f.review_disposition.to_dict())
                if f.review_disposition is not None
                else None
            )
            conn.execute(
                """
                INSERT INTO findings (
                    finding_id, claim_id, validation_run_id, status, evidence_state,
                    rule_id, rule_version, source_reference, check_type,
                    issue, reason, recommended_action,
                    evidence_references_json, review_disposition_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f.finding_id,
                    claim_id,
                    run_id,
                    f.status,
                    f.evidence_state,
                    f.rule_id,
                    f.rule_version,
                    f.source_reference,
                    f.check_type,
                    f.issue or f.reason[:120],
                    f.reason,
                    f.recommended_action,
                    json.dumps(f.evidence_references),
                    disp_json,
                    f.created_at,
                ),
            )
        conn.commit()
    return get_findings(claim_id, db_path=db_path)


def get_findings(claim_id: str, db_path: str = DEFAULT_DB_PATH) -> List[ValidationFinding]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM findings WHERE claim_id = ? ORDER BY CASE status WHEN 'FAIL' THEN 1 WHEN 'REVIEW' THEN 2 ELSE 3 END, rule_id",
            (claim_id,),
        ).fetchall()
        out: List[ValidationFinding] = []
        for r in rows:
            disp_data = (
                json.loads(r["review_disposition_json"])
                if r["review_disposition_json"]
                else None
            )
            disp = ReviewDisposition(**disp_data) if disp_data else None
            out.append(
                ValidationFinding(
                    finding_id=r["finding_id"],
                    claim_id=r["claim_id"],
                    validation_run_id=r["validation_run_id"] if "validation_run_id" in r.keys() else "RUN-DEFAULT",
                    status=r["status"],
                    evidence_state=r["evidence_state"] if "evidence_state" in r.keys() else (
                        "PRESENT" if r["status"] == "PASS" else ("MISSING" if r["status"] == "FAIL" else "UNCERTAIN")
                    ),
                    rule_id=r["rule_id"],
                    rule_version=int(r["rule_version"]),
                    source_reference=r["source_reference"],
                    check_type=r["check_type"],
                    issue=r["issue"] if "issue" in r.keys() else r["reason"],
                    reason=r["reason"],
                    recommended_action=r["recommended_action"] if "recommended_action" in r.keys() else "",
                    evidence_references=json.loads(r["evidence_references_json"]),
                    review_disposition=disp,
                    created_at=r["created_at"],
                )
            )
        return out


def record_review_disposition(
    claim_id: str,
    finding_id: str,
    reviewer: str,
    rationale: str,
    action: str = "RESOLVED_REVIEW",
    db_path: str = DEFAULT_DB_PATH,
) -> ValidationFinding:
    """Record a reasoned human disposition for a REVIEW finding while preserving the original finding."""
    if not reviewer or not reviewer.strip():
        raise ValueError("Reviewer identifier is required.")
    if not rationale or len(rationale.strip()) < 5:
        raise ValueError("A clear rationale (at least 5 characters) is required.")

    init_db(db_path)
    findings = get_findings(claim_id, db_path=db_path)
    target = next((f for f in findings if f.finding_id == finding_id), None)
    if not target:
        raise ValueError(f"Finding {finding_id} not found for claim {claim_id}.")

    if target.status == "FAIL":
        raise ValueError(
            "Human override cannot resolve or clear a FAIL finding. Add missing required evidence/fields and rerun validation."
        )
    if target.status != "REVIEW":
        raise ValueError(f"Disposition is only applicable to REVIEW findings (got {target.status}).")

    disposition = ReviewDisposition(
        disposition_id=f"DISP-{uuid.uuid4().hex[:8]}",
        finding_id=finding_id,
        reviewer=reviewer.strip(),
        timestamp=utc_now_iso(),
        rationale=rationale.strip(),
        action=action,
    )

    with get_connection(db_path) as conn:
        conn.execute(
            """
            UPDATE findings
            SET review_disposition_json = ?
            WHERE finding_id = ? AND claim_id = ?
            """,
            (json.dumps(disposition.to_dict()), finding_id, claim_id),
        )
        conn.commit()

    log_audit(
        actor=reviewer.strip(),
        action="HUMAN_REVIEW_DISPOSITION",
        redacted_details=(
            f"Recorded {action} disposition on REVIEW finding {finding_id} "
            f"(rule {target.rule_id}) while preserving original finding. Rationale: {rationale.strip()}"
        ),
        claim_id=claim_id,
        db_path=db_path,
    )
    updated_list = get_findings(claim_id, db_path=db_path)
    return next(f for f in updated_list if f.finding_id == finding_id)


def save_tool_traces(
    claim_id: str,
    traces: List[ToolTrace],
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    init_db(db_path)
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM tool_traces WHERE claim_id = ?", (claim_id,))
        for t in traces:
            conn.execute(
                """
                INSERT INTO tool_traces (
                    trace_id, claim_id, turn_index, tool, reason,
                    redacted_input_summary, redacted_output_summary, mode, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    t.trace_id,
                    claim_id,
                    t.turn_index,
                    t.tool,
                    t.reason,
                    t.redacted_input_summary,
                    t.redacted_output_summary,
                    t.mode,
                    t.timestamp,
                ),
            )
        conn.commit()


def get_tool_traces(claim_id: str, db_path: str = DEFAULT_DB_PATH) -> List[ToolTrace]:
    init_db(db_path)
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM tool_traces WHERE claim_id = ? ORDER BY turn_index ASC",
            (claim_id,),
        ).fetchall()
        return [
            ToolTrace(
                trace_id=r["trace_id"],
                claim_id=r["claim_id"],
                turn_index=int(r["turn_index"]),
                tool=r["tool"],
                reason=r["reason"],
                redacted_input_summary=r["redacted_input_summary"],
                redacted_output_summary=r["redacted_output_summary"],
                mode=r["mode"],
                timestamp=r["timestamp"],
            )
            for r in rows
        ]
