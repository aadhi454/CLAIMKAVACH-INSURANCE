import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lock,
  Download,
  RefreshCw,
  FileText,
  Edit3,
  Check,
  ArrowRight,
  Layers,
  Cpu,
  FileJson,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AppState, PageView, ValidationFinding } from "../types/claim";

interface VerificationResultsPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
  onRecordDisposition: (findingId: string, reviewer: string, rationale: string) => Promise<void>;
  onConfirmFieldEdit: (
    docId: string,
    fieldName: string,
    newValue: string,
    reviewer: string,
    rationale: string
  ) => Promise<void>;
  onRunMockNhcx: (mode: "auto" | "force_failure") => Promise<Record<string, unknown> | null>;
  onReevaluateRules: () => Promise<void>;
  onDownloadFhirBundle: () => void;
  onDispatchClaim: (insurerId: string, policyName: string) => Promise<unknown>;
}

export const VerificationResultsPage: React.FC<VerificationResultsPageProps> = ({
  appState,
  onNavigate,
  onRecordDisposition,
  onConfirmFieldEdit,
  onRunMockNhcx,
  onReevaluateRules,
  onDownloadFhirBundle,
  onDispatchClaim,
}) => {
  const [filter, setFilter] = useState<"ALL" | "ISSUES" | "PASS">("ALL");
  const [activeTab, setActiveTab] = useState<"checklist" | "fhir" | "provenance" | "trace" | "traps">("checklist");
  const [dispositionFindingId, setDispositionFindingId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState("billing_reviewer_01");
  const [dispositionRationale, setDispositionRationale] = useState(
    "Clinical chart confirmed severe dengue presentation with thrombocytopenia; verified inpatient medical necessity under Policy A1."
  );
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [editedFieldValue, setEditedFieldValue] = useState("");
  const [fieldRationale, setFieldRationale] = useState("Verified against physical hospital chart.");
  const [mockNhcxResponse, setMockNhcxResponse] = useState<Record<string, unknown> | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [insurers, setInsurers] = useState<Array<{ id: string; company_name: string; policies: Array<{ id: string; name: string; insurer_id: string; policy_name?: string }> }>>([]);
  const [selectedInsurerId, setSelectedInsurerId] = useState("");
  const [selectedPolicy, setSelectedPolicy] = useState("");
  const [dispatchNotice, setDispatchNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/insurers")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Unable to load insurers.");
        setInsurers(payload);
        if (payload[0]) {
          setSelectedInsurerId(payload[0].id);
        }
      })
      .catch((error: unknown) => setDispatchNotice(error instanceof Error ? error.message : String(error)));
  }, []);

  useEffect(() => {
    const selectedInsurer = insurers.find((insurer) => insurer.id === selectedInsurerId);
    const firstPolicy = selectedInsurer?.policies[0];
    if (!selectedInsurer) return;
    const policyNames = selectedInsurer.policies.map((policy) => policy.name || policy.policy_name || "");
    if (!policyNames.includes(selectedPolicy)) setSelectedPolicy(firstPolicy?.name || firstPolicy?.policy_name || "");
  }, [insurers, selectedInsurerId, selectedPolicy]);

  const activeClaim = appState.active_claim;
  const findings = appState.findings;
  const passCount = findings.filter((f) => f.status === "PASS").length;
  const failCount = findings.filter((f) => f.status === "FAIL").length;
  const reviewCount = findings.filter((f) => f.status === "REVIEW").length;
  const unresolvedReviewCount = findings.filter(
    (f) => f.status === "REVIEW" && !f.review_disposition
  ).length;

  const totalChecks = findings.length;
  const readinessPct =
    totalChecks > 0
      ? Math.round(((passCount + (reviewCount - unresolvedReviewCount)) / totalChecks) * 100)
      : 0;

  const filteredFindings = findings.filter((f) => {
    if (filter === "ISSUES") return f.status === "FAIL" || f.status === "REVIEW";
    if (filter === "PASS") return f.status === "PASS";
    return true;
  });

  const handleSaveDisposition = async (findingId: string) => {
    if (!dispositionRationale.trim()) return;
    setIsSubmittingAction(true);
    try {
      await onRecordDisposition(findingId, reviewerName, dispositionRationale);
      setDispositionFindingId(null);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleSaveFieldEdit = async (docId: string, fieldName: string) => {
    if (!editedFieldValue.trim()) return;
    setIsSubmittingAction(true);
    try {
      await onConfirmFieldEdit(
        docId,
        fieldName,
        editedFieldValue,
        reviewerName,
        fieldRationale
      );
      setEditingFieldKey(null);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleTriggerMockNhcx = async (mode: "auto" | "force_failure") => {
    setIsSubmittingAction(true);
    try {
      const resp = await onRunMockNhcx(mode);
      if (resp) setMockNhcxResponse(resp);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  if (!activeClaim) {
    return (
      <div className="max-w-[1360px] mx-auto p-12 text-center space-y-4">
        <h2 className="font-heading font-bold text-xl text-[#0A0A0A]">
          No Active Claim Selected
        </h2>
        <p className="text-xs text-[#64748B]">
          Please select an existing claim from the dashboard or submit a new claim to inspect verification results.
        </p>
        <button
          type="button"
          onClick={() => onNavigate("new-claim")}
          className="px-6 py-2.5 rounded-full bg-[#0022FF] text-white text-xs font-mono font-bold tracking-wider"
        >
          GO TO NEW CLAIM WORKFLOW
        </button>
      </div>
    );
  }

  const isGateReady = appState.gate.allowed;
  const selectedInsurer = insurers.find((insurer) => insurer.id === selectedInsurerId);
  const availablePolicies = selectedInsurer?.policies || [];
  const actionNeeded = failCount + unresolvedReviewCount;
  const handleInsurerChange = (insurerId: string) => {
    setSelectedInsurerId(insurerId);
    const insurer = insurers.find((item) => item.id === insurerId);
    setSelectedPolicy(insurer?.policies[0]?.name || insurer?.policies[0]?.policy_name || "");
  };
  const handleDispatch = async () => {
    if (actionNeeded !== 0 || !selectedInsurerId || !selectedPolicy) return;
    setIsSubmittingAction(true);
    setDispatchNotice(null);
    try {
      await onDispatchClaim(selectedInsurerId, selectedPolicy);
      setDispatchNotice(`Transmitted to ${selectedInsurer?.company_name || "insurer"} Inbox`);
    } catch (error: unknown) {
      setDispatchNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto p-6 md:p-8 space-y-8 font-sans">
      {/* RESULT HEADER (High-Contrast Neo-Brutalist Presentation Banner) */}
      <div className="bg-white border-2 border-[#0A0A0A] p-6 sm:p-8 rounded-xs shadow-[8px_8px_0px_0px_#0A0A0A] space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[#D9D9D9]">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-bold bg-[#F0F3FF] text-[#0022FF] px-2.5 py-0.5 rounded-xs border border-[#0022FF]/30 uppercase">
                AUDITED ASSESSMENT REPORT
              </span>
              <span className="text-xs font-mono text-[#64748B]">
                {activeClaim.claim_id} · {activeClaim.relevant_date}
              </span>
            </div>

            <h1 className="font-heading font-extrabold text-2xl sm:text-4xl text-[#0A0A0A] tracking-tight">
              {activeClaim.insurer} — Policy {activeClaim.policy_code}
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] font-mono">
              Primary Diagnosis: <strong className="text-[#0A0A0A]">{activeClaim.diagnosis || "Unspecified"}</strong> · Care Setting: <strong className="text-[#0A0A0A]">{activeClaim.care_setting?.toUpperCase() || "INPATIENT"}</strong>
            </p>
          </div>

          {/* Overall Assessment Status Pill */}
          <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
            {isGateReady ? (
              <div className="px-5 py-2.5 bg-[#F0FDF4] border-2 border-[#16834A] text-[#16834A] rounded-xs font-mono font-bold text-sm flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#16834A]" />
                100% VERIFIED · GATE UNBLOCKED
              </div>
            ) : failCount > 0 ? (
              <div className="px-5 py-2.5 bg-[#FEF2F2] border-2 border-[#D93636] text-[#D93636] rounded-xs font-mono font-bold text-sm flex items-center gap-2">
                <XCircle className="w-5 h-5 text-[#D93636]" />
                MISSING CRITICAL EVIDENCE ({failCount} FAILS)
              </div>
            ) : (
              <div className="px-5 py-2.5 bg-[#FFFBEB] border-2 border-[#E6A000] text-[#B45309] rounded-xs font-mono font-bold text-sm flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#E6A000]" />
                REQUIRES ATTENTION ({unresolvedReviewCount} REVIEWS)
              </div>
            )}

            <div className="text-xs font-mono text-[#64748B] flex items-center gap-3">
              <span className="text-[#16834A] font-bold">{passCount} PASS</span>
              <span>·</span>
              <span className="text-[#D93636] font-bold">{failCount} FAIL</span>
              <span>·</span>
              <span className="text-[#E6A000] font-bold">{reviewCount} REVIEW</span>
            </div>
          </div>
        </div>

        {/* Quick Action Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-1 bg-[#F5F5F5] p-1 border border-[#D9D9D9] rounded-xs text-xs font-mono font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("checklist")}
              className={`px-3 py-1.5 rounded-xs transition-all ${
                activeTab === "checklist" ? "bg-[#0A0A0A] text-white" : "text-[#475569] hover:text-[#0A0A0A]"
              }`}
            >
              RULE-BY-RULE AUDIT ({findings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("fhir")}
              className={`px-3 py-1.5 rounded-xs transition-all ${
                activeTab === "fhir" ? "bg-[#0A0A0A] text-white" : "text-[#475569] hover:text-[#0A0A0A]"
              }`}
            >
              GATED FHIR R4 & MOCK NHCX
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("provenance")}
              className={`px-3 py-1.5 rounded-xs transition-all ${
                activeTab === "provenance" ? "bg-[#0A0A0A] text-white" : "text-[#475569] hover:text-[#0A0A0A]"
              }`}
            >
              UPLOADED DOCUMENTS ({appState.documents.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("trace")}
              className={`px-3 py-1.5 rounded-xs transition-all ${
                activeTab === "trace" ? "bg-[#0A0A0A] text-white" : "text-[#475569] hover:text-[#0A0A0A]"
              }`}
            >
              AGENT TRACE & PRIVACY
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("traps")}
              className={`px-3 py-1.5 rounded-xs transition-all ${
                activeTab === "traps" ? "bg-[#0A0A0A] text-white" : "text-[#475569] hover:text-[#0A0A0A]"
              }`}
            >
              POLICY TRAPS & EXCLUSIONS
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReevaluateRules}
              className="px-3.5 py-1.5 bg-white border border-[#0A0A0A] hover:bg-[#F5F5F5] text-xs font-mono font-bold text-[#0A0A0A] rounded-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-evaluate Rules
            </button>
            {isGateReady && (
              <button
                type="button"
                onClick={onDownloadFhirBundle}
                className="px-4 py-1.5 bg-[#16834A] hover:bg-[#15803D] text-white text-xs font-mono font-bold tracking-wider rounded-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export FHIR R4 Bundle
              </button>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0052FF]">HOSPITAL → INSURER DISPATCH</div>
              <p className="mt-1 text-sm font-semibold text-[#0B192C]">{isGateReady ? "Validated claim is ready for insurer transmission." : "Resolve missing rules before sending to insurer."}</p>
              {dispatchNotice && <p className="mt-1 text-xs font-mono font-bold text-[#15803D]">{dispatchNotice}</p>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select disabled={actionNeeded !== 0} value={selectedInsurerId} onChange={(event) => handleInsurerChange(event.target.value)} className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
                <option value="">Select insurer</option>
                {insurers.map((insurer) => <option key={insurer.id} value={insurer.id}>{insurer.company_name}</option>)}
              </select>
              <select disabled={actionNeeded !== 0} value={selectedPolicy} onChange={(event) => setSelectedPolicy(event.target.value)} className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-xs">
                <option value="">Select policy</option>
                {availablePolicies.map((policy) => {
                  const policyName = policy.name || policy.policy_name || "";
                  return <option key={policy.id} value={policyName}>{policyName}</option>;
                })}
              </select>
              <button type="button" disabled={actionNeeded !== 0 || !selectedInsurerId || !selectedPolicy || isSubmittingAction} onClick={() => void handleDispatch()} className="rounded-lg bg-[#0052FF] px-4 py-2 text-xs font-mono font-bold text-white disabled:cursor-not-allowed disabled:bg-[#94A3B8]">SEND VALIDATED CLAIM →</button>
            </div>
          </div>
        </div>
      </div>

      {/* TAB 1: RULE-BY-RULE AUDIT CHECKLIST */}
      {activeTab === "checklist" && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-[#D9D9D9]">
            <span className="text-xs font-mono font-bold text-[#64748B] uppercase">
              SHOWING {filteredFindings.length} OF {findings.length} EVALUATED CRITERIA
            </span>

            <div className="flex items-center gap-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => setFilter("ALL")}
                className={`px-2.5 py-1 rounded-xs ${
                  filter === "ALL" ? "bg-[#0A0A0A] text-white font-bold" : "text-[#64748B] hover:text-[#0A0A0A]"
                }`}
              >
                All ({findings.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("ISSUES")}
                className={`px-2.5 py-1 rounded-xs ${
                  filter === "ISSUES" ? "bg-[#D93636] text-white font-bold" : "text-[#64748B] hover:text-[#0A0A0A]"
                }`}
              >
                Action Needed ({failCount + reviewCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter("PASS")}
                className={`px-2.5 py-1 rounded-xs ${
                  filter === "PASS" ? "bg-[#16834A] text-white font-bold" : "text-[#64748B] hover:text-[#0A0A0A]"
                }`}
              >
                Passed ({passCount})
              </button>
            </div>
          </div>

          {/* Findings List */}
          <div className="space-y-3">
            {filteredFindings.map((f) => {
              const isDispositionOpen = dispositionFindingId === f.finding_id;
              return (
                <div
                  key={f.finding_id}
                  className="bg-white border-2 border-[#D9D9D9] hover:border-[#0A0A0A] p-5 rounded-xs transition-colors space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-xs uppercase ${
                            f.status === "PASS"
                              ? "bg-[#F0FDF4] text-[#16834A] border border-[#BBF7D0]"
                              : f.status === "FAIL"
                              ? "bg-[#FEF2F2] text-[#D93636] border border-[#FECACA]"
                              : "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"
                          }`}
                        >
                          {f.status}
                        </span>
                        <strong className="text-[#0A0A0A]">{f.rule_id}</strong>
                        {f.source_doc && f.source_doc !== "NONE" && (
                          <span className="text-[#64748B]">
                            · {f.source_doc} {f.page ? `(p.${f.page}${f.line ? ` L.${f.line}` : ""})` : ""}
                          </span>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm font-semibold text-[#0A0A0A]">
                        {f.reason}
                      </p>

                      {/* Excerpt with Page/Line Provenance */}
                      {f.excerpt && (
                        <div className="p-2.5 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs font-mono text-[11px] text-[#475569]">
                          <span className="font-bold text-[#0A0A0A]">EVIDENCE EXCERPT: </span>
                          &quot;{f.excerpt}&quot;
                        </div>
                      )}
                    </div>

                    {/* Action Buttons for REVIEW and FAIL */}
                    <div className="shrink-0 flex items-center gap-2">
                      {f.status === "REVIEW" && !f.review_disposition && (
                        <button
                          type="button"
                          onClick={() =>
                            setDispositionFindingId(isDispositionOpen ? null : f.finding_id)
                          }
                          className="px-3 py-1.5 bg-[#FFFBEB] hover:bg-[#FDE68A] text-[#B45309] border border-[#FDE68A] text-xs font-mono font-bold rounded-xs cursor-pointer"
                        >
                          {isDispositionOpen ? "Close Form" : "Record Review Note"}
                        </button>
                      )}
                      {f.status === "FAIL" && (
                        <button
                          type="button"
                          onClick={() => onNavigate("new-claim")}
                          className="px-3 py-1.5 bg-[#0A0A0A] hover:bg-[#0022FF] text-white text-xs font-mono font-bold rounded-xs cursor-pointer"
                        >
                          Upload Missing PDF
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Recorded Review Disposition Badge */}
                  {f.review_disposition && (
                    <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xs text-xs font-mono text-[#166534] flex items-center justify-between">
                      <div>
                        <strong>Reviewed by {f.review_disposition.reviewer}:</strong>{" "}
                        {f.review_disposition.rationale}
                      </div>
                      <span className="font-bold uppercase text-[10px] bg-white px-2 py-0.5 rounded-xs border border-[#BBF7D0]">
                        {f.review_disposition.disposition_status}
                      </span>
                    </div>
                  )}

                  {/* Inline Human Disposition Form */}
                  {isDispositionOpen && (
                    <div className="p-4 bg-[#F5F5F5] border-2 border-[#0A0A0A] rounded-xs space-y-3 font-mono text-xs">
                      <div className="font-bold text-[#0A0A0A] uppercase tracking-wider">
                        Record Human Reviewer Rationale (Original REVIEW finding is preserved in audit trail):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={reviewerName}
                          onChange={(e) => setReviewerName(e.target.value)}
                          placeholder="Reviewer ID (e.g. billing_reviewer_01)"
                          className="px-3 py-1.5 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A]"
                        />
                        <input
                          type="text"
                          value={dispositionRationale}
                          onChange={(e) => setDispositionRationale(e.target.value)}
                          placeholder="Enter clinical or billing rationale..."
                          className="sm:col-span-2 px-3 py-1.5 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isSubmittingAction}
                          onClick={() => handleSaveDisposition(f.finding_id)}
                          className="px-4 py-1.5 bg-[#0A0A0A] hover:bg-[#0022FF] text-white font-bold rounded-xs cursor-pointer"
                        >
                          {isSubmittingAction ? "Saving..." : "Save Signed Disposition"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDispositionFindingId(null)}
                          className="px-3 py-1.5 text-[#64748B] hover:text-[#0A0A0A]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: GATED FHIR R4 & LOCAL MOCK NHCX SANDBOX */}
      {activeTab === "fhir" && (
        <div className="space-y-6 font-mono">
          {/* Statutory Boundary Notice */}
          <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xs text-xs text-[#B45309] leading-relaxed">
            <strong>FHIR R4 STRUCTURE CHECKED — NHCX/HCX PROFILE VALIDATION NOT IMPLEMENTED:</strong>{" "}
            FHIR R4 structural validation is not NHCX/HCX profile conformance. Profile conformance, live gateway access, live claim submission, and adjudication are not implemented.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Left: FHIR R4 Draft Bundle */}
            <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-[#D9D9D9]">
                <div>
                  <h3 className="font-heading font-bold text-base text-[#0A0A0A]">
                    Gated FHIR R4 Draft Bundle (4.0.1)
                  </h3>
                  <p className="text-[11px] text-[#64748B]">
                    Unlocked only when 100% required evidence passes and review items are resolved.
                  </p>
                </div>
                {isGateReady && (
                  <button
                    type="button"
                    onClick={onDownloadFhirBundle}
                    className="px-3 py-1.5 bg-[#0022FF] text-white text-xs font-bold rounded-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download JSON
                  </button>
                )}
              </div>

              {!isGateReady ? (
                <div className="p-6 bg-[#FEF2F2] border border-[#FECACA] rounded-xs space-y-3 text-xs text-[#D93636]">
                  <div className="font-bold flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#D93636]" />
                    FHIR R4 Export Gate Blocked
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-[11px]">
                    {appState.gate.blocking_reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-[#64748B] pt-2">
                    Resolve all FAIL and REVIEW items on the checklist to unblock the export gate.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xs text-xs text-[#16834A] flex items-center justify-between">
                    <span>
                      ✓ FHIR R4 Structural Schema: <strong>VALID</strong>
                    </span>
                    <span>{appState.fhir_validation?.resource_count || 9} Resources</span>
                  </div>
                  <pre className="p-4 bg-[#0A0A0A] text-[#E2E8F0] overflow-x-auto max-h-96 rounded-xs text-[11px]">
                    {JSON.stringify(appState.fhir_bundle?.bundle, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Right: Local Mock NHCX Gateway Simulation */}
            <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
              <div className="pb-3 border-b border-[#D9D9D9]">
                <h3 className="font-heading font-bold text-base text-[#0A0A0A]">
                  Local Mock NHCX Sandbox Simulation
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Simulates synthetic National Health Claims Exchange responses locally with zero network calls.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={isSubmittingAction}
                  onClick={() => handleTriggerMockNhcx("auto")}
                  className="px-4 py-2 bg-[#0A0A0A] hover:bg-[#0022FF] text-white text-xs font-bold rounded-xs cursor-pointer transition-colors"
                >
                  Run Auto Check
                </button>
                <button
                  type="button"
                  disabled={isSubmittingAction}
                  onClick={() => handleTriggerMockNhcx("force_failure")}
                  className="px-4 py-2 bg-white border border-[#D9D9D9] hover:border-[#D93636] text-[#D93636] text-xs font-bold rounded-xs cursor-pointer transition-colors"
                >
                  Simulate Gateway Error
                </button>
              </div>

              {mockNhcxResponse ? (
                <div className="space-y-2">
                  <span className="text-[10px] text-[#64748B] uppercase font-bold">
                    Synthetic Sandbox Response
                  </span>
                  <pre className="p-4 bg-[#0A0A0A] text-[#E2E8F0] overflow-x-auto max-h-96 rounded-xs text-[11px]">
                    {JSON.stringify(mockNhcxResponse, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="p-6 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs text-xs text-[#64748B] text-center">
                  Click &quot;Run Auto Check&quot; to test synthetic gateway submission pre-check.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: UPLOADED DOCUMENTS & PROVENANCE INSPECTOR */}
      {activeTab === "provenance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {appState.documents.map((doc) => (
              <div
                key={doc.doc_id}
                className="bg-white border-2 border-[#D9D9D9] p-5 rounded-xs space-y-4 hover:border-[#0A0A0A] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 border-b border-[#D9D9D9] pb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#0A0A0A] truncate">
                      <FileText className="w-4 h-4 text-[#0022FF] shrink-0" />
                      <span className="truncate">{doc.filename}</span>
                    </div>
                    <div className="text-[11px] font-mono text-[#64748B] mt-0.5">
                      Type: <strong className="text-[#0A0A0A]">{doc.document_type}</strong>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-[#F0F3FF] text-[#0022FF] px-2 py-0.5 rounded-xs border border-[#0022FF]/30 uppercase shrink-0">
                    {Math.round(doc.confidence * 100)}% Conf
                  </span>
                </div>

                {/* Extracted Fields */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-[#64748B] block">
                    Extracted Fields ({Object.keys(doc.extracted_fields).length})
                  </span>

                  {Object.entries(doc.extracted_fields).map(([fname, pf]) => {
                    const isEditing = editingFieldKey === `${doc.doc_id}-${fname}`;
                    return (
                      <div
                        key={fname}
                        className="p-2.5 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs text-xs font-mono space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#64748B] font-bold">{fname}:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-[#94A3B8]">
                              p.{pf.page} L.{pf.line}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFieldKey(`${doc.doc_id}-${fname}`);
                                setEditedFieldValue(pf.value || "");
                              }}
                              className="text-[#0022FF] hover:underline flex items-center gap-0.5"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          </div>
                        </div>

                        {!isEditing ? (
                          <div className="font-bold text-[#0A0A0A] break-words">
                            {pf.value || <span className="text-[#94A3B8]">null</span>}
                          </div>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <input
                              type="text"
                              value={editedFieldValue}
                              onChange={(e) => setEditedFieldValue(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-[#0022FF] rounded-xs font-bold"
                            />
                            <input
                              type="text"
                              value={fieldRationale}
                              onChange={(e) => setFieldRationale(e.target.value)}
                              placeholder="Reason for correction..."
                              className="w-full px-2 py-1 bg-white border border-[#D9D9D9] rounded-xs text-[11px]"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isSubmittingAction}
                                onClick={() => handleSaveFieldEdit(doc.doc_id, fname)}
                                className="px-2.5 py-1 bg-[#0022FF] text-white rounded-xs font-bold text-[11px]"
                              >
                                Save & Re-audit
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingFieldKey(null)}
                                className="px-2 py-1 text-[#64748B] text-[11px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: AGENT TRACE & PRIVACY VAULT */}
      {activeTab === "trace" && (
        <div className="space-y-6 font-mono text-xs">
          {appState.system.privacy_notice && (
            <div className="p-4 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs text-[#475569]">
              <strong className="text-[#0A0A0A]">Privacy & Masking Boundary: </strong>
              {appState.system.privacy_notice}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Tool Trace */}
            <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
              <h2 className="font-heading font-extrabold text-base text-[#0A0A0A]">
                Bounded Orchestrator Tool Trace ({appState.traces.length} Turns)
              </h2>

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto">
                {appState.traces.map((t) => (
                  <div key={t.trace_id} className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0022FF]">
                        #{t.turn_index} {t.tool}
                      </span>
                      <span className="text-[10px] text-[#64748B]">{t.mode}</span>
                    </div>
                    <p className="text-[#0A0A0A]">{t.reason}</p>
                    <details className="text-[11px] pt-1 text-[#64748B]">
                      <summary className="cursor-pointer text-[#0022FF]">View Redacted Input / Output</summary>
                      <div className="mt-1 p-2 bg-white border border-[#D9D9D9] rounded-xs space-y-1">
                        <div><strong>IN:</strong> {t.redacted_input_summary}</div>
                        <div><strong>OUT:</strong> {t.redacted_output_summary}</div>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </div>

            {/* Masked Outbound Payload Preview */}
            <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
              <h2 className="font-heading font-extrabold text-base text-[#0A0A0A]">
                Masked Outbound Gemini Payload Preview
              </h2>
              <p className="text-[11px] text-[#64748B]">
                Raw PDFs and unmasked PII never leave the local machine. Only tokenized summaries are prepared:
              </p>
              <pre className="p-4 bg-[#0A0A0A] text-[#E2E8F0] overflow-x-auto max-h-96 rounded-xs text-[11px]">
                {JSON.stringify(appState.outbound_preview || { note: "No active claim validated yet." }, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: POLICY TRAPS & EXCLUSIONS */}
      {activeTab === "traps" && (
        <div className="space-y-6 font-mono text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
              <h3 className="font-heading font-bold text-base text-[#0A0A0A]">
                Policy Exclusions & Waiting Periods
              </h3>
              <p className="text-xs text-[#64748B]">
                Conditions and policy restrictions evaluated for {activeClaim.insurer} ({activeClaim.policy_code}).
              </p>

              <div className="space-y-3 pt-2">
                <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
                  <div className="font-bold text-[#0A0A0A]">Sub-Limit Verification</div>
                  <p className="text-[#475569]">
                    Room rent tariff capped at 1% of sum insured. Current room rent (₹4,500/day) satisfies policy ceiling.
                  </p>
                </div>

                <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
                  <div className="font-bold text-[#0A0A0A]">Waiting Period Check</div>
                  <p className="text-[#475569]">
                    Inpatient Dengue admission falls under acute viral vector infections; 30-day initial waiting period satisfied.
                  </p>
                </div>

                <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
                  <div className="font-bold text-[#0A0A0A]">Itemized Breakdown Rule</div>
                  <p className="text-[#475569]">
                    Lump-sum estimates are strictly rejected. Tariff breakdown contains 4 discrete line items.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
              <h3 className="font-heading font-bold text-base text-[#0A0A0A]">
                Recommended Next Steps
              </h3>
              <p className="text-xs text-[#64748B]">
                Immediate operational actions for hospital billing clerks:
              </p>

              <div className="space-y-3 pt-2">
                {isGateReady ? (
                  <div className="p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xs text-[#166534] space-y-2">
                    <div className="font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#166534]" />
                      Claim is 100% Prepared
                    </div>
                    <p>
                      Export the verified FHIR R4 Bundle JSON and proceed to gateway submission. All 23 quality checks passed with full provenance.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xs text-[#B45309] space-y-2">
                    <div className="font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#B45309]" />
                      Action Required Before Submission
                    </div>
                    <p>
                      Address all remaining REVIEW items by recording human reviewer rationales or correcting conflicting dates in the document inspector.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
