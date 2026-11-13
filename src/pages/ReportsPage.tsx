import React from "react";
import {
  BarChart3,
  Download,
  PieChart,
  TrendingUp,
  FileText,
  AlertTriangle,
  CheckCircle2,
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
  const claims = appState.claims || [];
  const findings = appState.findings || [];

  const totalClaims = claims.length;
  const verifiedCount = claims.filter(
    (c) => c.status === "READY_FOR_FHIR" || c.status === "VERIFIED"
  ).length;
  const reviewCount = claims.filter((c) => c.status === "NEEDS_REVIEW").length;
  const draftCount = claims.filter((c) => c.status === "DRAFT" || c.status === "PROCESSING").length;

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

        <button
          type="button"
          onClick={handleExportSummary}
          className="px-4 py-2 bg-[#0A0A0A] hover:bg-[#0022FF] text-white font-mono text-xs font-bold rounded-xs flex items-center gap-2 transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Export Audit Summary (JSON)
        </button>
      </div>

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
            {totalClaims > 0 ? Math.round((verifiedCount / totalClaims) * 100) : 100}%
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

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
        {/* Missing Document Frequency Meter */}
        <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
          <h3 className="font-heading font-bold text-base text-[#0A0A0A]">
            Avoidable Error Frequency
          </h3>
          <p className="text-xs text-[#64748B]">
            Primary causes of claim blockage detected across hospital pre-submissions:
          </p>

          <div className="space-y-3 pt-2">
            {[
              { label: "Missing Itemized Estimate / Non-Itemized Bill", pct: 42, color: "bg-[#D93636]" },
              { label: "Conflicting Admission Dates across Documents", pct: 28, color: "bg-[#E6A000]" },
              { label: "Pending Serology Slip ('Report Awaited')", pct: 18, color: "bg-[#0022FF]" },
              { label: "Missing Mandatory KYC Photo ID Proof", pct: 12, color: "bg-[#64748B]" },
            ].map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#0A0A0A] font-bold">{item.label}</span>
                  <span className="font-bold">{item.pct}%</span>
                </div>
                <div className="w-full bg-[#F5F5F5] h-2 rounded-full overflow-hidden border border-[#D9D9D9]">
                  <div className={`${item.color} h-full`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Insurer Volume Distribution */}
        <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm">
          <h3 className="font-heading font-bold text-base text-[#0A0A0A]">
            Insurer Policy Distribution
          </h3>
          <p className="text-xs text-[#64748B]">
            Claims breakdown across active payer schedules:
          </p>

          <div className="space-y-3 pt-2">
            {[
              { name: "Fictional Insurer A — Policy A1 (Standard Inpatient)", count: "55% of volume" },
              { name: "Fictional Insurer A — Policy A2 (Surgical & Critical)", count: "25% of volume" },
              { name: "Fictional Insurer B — Policy B1 (Metro Speciality)", count: "15% of volume" },
              { name: "Fictional Insurer B — Policy B2 (Corporate Group)", count: "5% of volume" },
            ].map((p, idx) => (
              <div key={idx} className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs flex items-center justify-between">
                <span className="font-bold text-[#0A0A0A]">{p.name}</span>
                <span className="text-[#0022FF] font-bold">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
