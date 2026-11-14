import React from "react";
import {
  Download,
} from "lucide-react";
import { AppState, PageView } from "../types/claim";

interface ReportsPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  appState,
  onNavigate,
}) => {
  const [generatingReport, setGeneratingReport] = React.useState(false);
  const [reportError, setReportError] = React.useState<string | null>(null);
  const claims = appState.claims || [];
  const findings = appState.findings || [];

  const totalClaims = claims.length;
  const verifiedCount = claims.filter(
    (c) => c.status === "READY_FOR_FHIR" || c.status === "VERIFIED"
  ).length;
  const reviewCount = claims.filter((c) => c.status === "NEEDS_REVIEW").length;
  const passCount = findings.filter((f) => f.status === "PASS").length;
  const failCount = findings.filter((f) => f.status === "FAIL").length;
  const unresolvedReviewCount = findings.filter(
    (f) => f.status === "REVIEW" && !f.review_disposition
  ).length;
  const issueBreakdown = [
    {
      label: "Critical evidence gaps",
      count: failCount,
      color: "bg-[#D93636]",
      text: "text-[#D93636]",
    },
    {
      label: "Unresolved human reviews",
      count: unresolvedReviewCount,
      color: "bg-[#E6A000]",
      text: "text-[#B45309]",
    },
    {
      label: "Verified checks",
      count: passCount,
      color: "bg-[#16834A]",
      text: "text-[#16834A]",
    },
  ];
  const policyBreakdown = Array.from(
    claims.reduce((counts, claim) => {
      const key = `${claim.insurer} — Policy ${claim.policy_code}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map<string, number>())
  ).sort(([, first], [, second]) => second - first);

  const handleExportSummary = () => {
    const reportData = {
      generated_at: new Date().toISOString(),
      total_claims_processed: totalClaims,
      verified_ready_count: verifiedCount,
      needs_review_count: reviewCount,
      claims: claims.map((c) => ({
        id: c.claim_id,
        insurer: c.insurer,
        policy: c.policy_code,
        status: c.status,
        diagnosis: c.diagnosis,
      })),
      evaluated_findings_count: findings.length,
      active_claim_risk_summary: appState.risk_summary,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claimkavach_audit_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateAssessment = async () => {
    const claimId = appState.active_claim?.claim_id;
    if (!claimId) {
      setReportError("Select or process a claim before generating an assessment report.");
      return;
    }
    try {
      setGeneratingReport(true);
      setReportError(null);
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_report", payload: { claim_id: claimId } }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.filename) {
        throw new Error(result.error || "Assessment report generation failed.");
      }
      const link = document.createElement("a");
      link.href = `/api/report/${encodeURIComponent(result.filename)}`;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error: unknown) {
      setReportError(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto p-6 md:p-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-widest">
            ANALYTICS & READINESS REPORT
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#0A0A0A] tracking-tight">
            Readiness Audit Metrics
          </h1>
          <p className="text-xs text-[#64748B]">
            Aggregated operational indicators on document completeness, verification outcomes, and policy adherence.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGenerateAssessment}
            disabled={generatingReport}
            className="px-4 py-2 bg-[#0022FF] hover:bg-[#0044FF] disabled:opacity-60 text-white font-mono text-xs font-bold rounded-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {generatingReport ? "Generating PDF..." : "Download Assessment PDF"}
          </button>
          <button
            type="button"
            onClick={handleExportSummary}
            className="px-4 py-2 bg-[#0A0A0A] hover:bg-[#0022FF] text-white font-mono text-xs font-bold rounded-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>
      </div>
      {reportError && (
        <div className="border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs font-mono text-[#B91C1C]">
          {reportError}
        </div>
      )}

      {/* Aggregate Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        <div className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs">
          <span className="text-[11px] font-bold uppercase text-[#64748B]">Processed Claims</span>
          <div className="font-heading font-extrabold text-4xl text-[#0A0A0A] tabular-nums">
            {totalClaims.toString().padStart(2, "0")}
          </div>
          <div className="text-[#64748B]">100% evaluated on-premise</div>
        </div>

        <div className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs">
          <span className="text-[11px] font-bold uppercase text-[#16834A]">Gate-Ready Ratio</span>
          <div className="font-heading font-extrabold text-4xl text-[#16834A] tabular-nums">
            {totalClaims > 0 ? Math.round((verifiedCount / totalClaims) * 100) : 0}%
          </div>
          <div className="text-[#16834A] font-bold">● Unblocked for FHIR export</div>
        </div>

        <div className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs">
          <span className="text-[11px] font-bold uppercase text-[#E6A000]">Human Review Triggers</span>
          <div className="font-heading font-extrabold text-4xl text-[#E6A000] tabular-nums">
            {reviewCount.toString().padStart(2, "0")}
          </div>
          <div className="text-[#64748B]">Awaited lab tests & date conflicts</div>
        </div>

        <div className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs">
          <span className="text-[11px] font-bold uppercase text-[#0022FF]">Rules Evaluated</span>
          <div className="font-heading font-extrabold text-4xl text-[#0022FF] tabular-nums">
            {findings.length.toString().padStart(2, "0")}
          </div>
          <div className="text-[#64748B]">Deterministic SQLite checks</div>
        </div>
      </div>

      <div className="bg-white border-2 border-[#D9D9D9] p-6 rounded-xs space-y-4">
        <div>
          <h3 className="font-heading font-bold text-base text-[#0A0A0A]">Required document profile</h3>
          <p className="text-xs text-[#64748B]">
            Derived from the active approved policy rules; this is a completeness check, not an adjudication decision.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {appState.document_completeness.items.map((item) => (
            <div key={item.document_type} className="p-3 bg-[#F8FAFC] border border-[#D9E2EC] text-xs font-mono">
              <div className="font-bold text-[#0A0A0A]">{item.document_type}</div>
              <div className={item.status === "RECEIVED" ? "text-[#16834A]" : "text-[#D93636]"}>
                {item.status}
              </div>
            </div>
          ))}
          {appState.document_completeness.items.length === 0 && (
            <div className="text-xs text-[#64748B]">No approved document profile is active for this claim.</div>
          )}
        </div>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
        {/* Missing Document Frequency Meter */}
        <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
          <h3 className="font-heading font-bold text-base text-[#0A0A0A]">
            Avoidable Error Frequency
          </h3>
          <p className="text-xs text-[#64748B]">
            Live finding profile for the currently selected claim.
          </p>

          <div className="space-y-3 pt-2">
            {issueBreakdown.map((item) => {
              const pct = findings.length > 0 ? Math.round((item.count / findings.length) * 100) : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between">
                    <span className={`font-bold ${item.text}`}>{item.label}</span>
                    <span className="font-bold">{item.count} · {pct}%</span>
                  </div>
                  <div className="w-full bg-[#F5F5F5] h-2 rounded-full overflow-hidden border border-[#D9D9D9]">
                    <div className={`${item.color} h-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Insurer Volume Distribution */}
        <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
          <h3 className="font-heading font-bold text-base text-[#0A0A0A]">
            Insurer Policy Distribution
          </h3>
          <p className="text-xs text-[#64748B]">
            Actual claim volume by insurer and policy.
          </p>

          <div className="space-y-3 pt-2">
            {policyBreakdown.length === 0 ? (
              <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs text-[#64748B]">
                No claims have been processed yet.
              </div>
            ) : (
              policyBreakdown.map(([name, count]) => (
                <div key={name} className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs flex items-center justify-between">
                  <span className="font-bold text-[#0A0A0A]">{name}</span>
                  <span className="text-[#0022FF] font-bold">{count} claim{count === 1 ? "" : "s"}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
