export interface ProvenanceField {
  field_name: string;
  value: string | null;
  confidence: number;
  source_doc: string;
  page: number;
  line: number;
  excerpt: string;
  confirmed_by_human: boolean;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
}

export interface ExtractedDoc {
  doc_id: string;
  claim_id: string;
  filename: string;
  document_type: string;
  document_subtype?: string | null;
  processing_mode: string;
  ocr_Status_reason?: string;
  page_count: number;
  confidence: number;
  extracted_fields: Record<string, ProvenanceField>;
}

export interface ReviewDisposition {
  reviewer: string;
  timestamp: string;
  rationale: string;
  disposition_status: string;
}

export interface ValidationFinding {
  finding_id: string;
  claim_id: string;
  check_code?: string;
  check_type?: string;
  status: "PASS" | "FAIL" | "REVIEW";
  evidence_state?: "PRESENT" | "MISSING" | "UNCERTAIN";
  issue?: string;
  reason: string;
  recommended_action?: string;
  rule_id: string;
  source_doc: string;
  page: number | null;
  line: number | null;
  excerpt: string;
  field_name?: string | null;
  review_disposition?: ReviewDisposition | null;
  evidence_references?: Array<{
    source_document: string;
    page: number;
    evidence_excerpt: string;
    field_name: string;
    value: string;
  }>;
}

export interface ToolTrace {
  trace_id: string;
  claim_id: string;
  turn_index: number;
  tool: string;
  reason: string;
  redacted_input_summary: string;
  redacted_output_summary: string;
  mode: string;
  timestamp: string;
}

export interface RuleItem {
  rule_id: string;
  version: number;
  insurer: string;
  policy_code: string;
  claim_type: string;
  conditions?: string[];
  description: string;
  required_documents: string[];
  required_fields: string[];
  effective_start: string;
  effective_end: string;
  approval_state: "APPROVED" | "DRAFT" | "DEACTIVATED";
  source_reference: string;
  approver?: string | null;
  created_at: string;
  is_synthetic: boolean;
}

export interface AuditEntry {
  audit_id: string;
  timestamp: string;
  actor: string;
  claim_id?: string | null;
  action: string;
  redacted_details: string;
}

export interface ClaimPacket {
  claim_id: string;
  insurer: string;
  policy_code: string;
  claim_type: string;
  relevant_date: string;
  diagnosis?: string;
  care_setting?: string;
  patient_reference?: string;
  patient_name?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  estimated_amount?: string;
}

export interface PolicyConfig {
  insurer: string;
  policy_code: string;
  policy_name: string;
  category?: string;
  supported_claim_types?: string[];
  coverage_highlights?: string[];
  waiting_period?: string;
  room_rent_cap?: string;
  co_pay?: string;
  is_synthetic?: boolean;
}

export interface SystemInfo {
  gemini_configured: boolean;
  default_mode: string;
  tesseract_available: boolean;
  fhir_version: string;
  fhir_disclaimer: string;
  privacy_notice?: string;
  sample_files: Record<string, string>;
}

export interface AppState {
  system: SystemInfo;
  policy_configs: PolicyConfig[];
  claims: ClaimPacket[];
  active_claim: ClaimPacket | null;
  documents: ExtractedDoc[];
  applicable_rules?: RuleItem[];
  excluded_rules?: Array<{
    rule_id: string;
    version: number;
    approval_state: string;
    reasons: string[];
  }>;
  outbound_preview?: Record<string, unknown> | null;
  findings: ValidationFinding[];
  traces: ToolTrace[];
  rules: RuleItem[];
  audit_logs: AuditEntry[];
  gate: {
    allowed: boolean;
    blocking_reasons: string[];
  };
  fhir_bundle: {
    fhir_version: string;
    boundary_disclaimer: string;
    bundle: Record<string, unknown>;
    omitted_fields?: Array<{ field: string; reason: string }>;
  } | null;
  fhir_validation: {
    valid: boolean;
    fhir_version: string;
    boundary_disclaimer: string;
    resource_count: number;
    validated_resources?: Array<{ fullUrl: string; resourceType: string; id: string }>;
    errors: string[];
  } | null;
}

export type PageView =
  | "landing"
  | "login"
  | "dashboard"
  | "new-claim"
  | "verifying"
  | "results"
  | "all-claims"
  | "policies"
  | "rules"
  | "documents"
  | "reports"
  | "settings";

export interface DemoUser {
  username: string;
  role: "Billing Administrator" | "Claims Auditor" | "Medical Director";
  email: string;
  hospital: string;
}
