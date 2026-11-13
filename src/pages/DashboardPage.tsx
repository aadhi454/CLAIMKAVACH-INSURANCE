import React from "react";
import {
  PlusCircle,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Lock,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { AppState, ClaimPacket, PageView } from "../types/claim";

interface DashboardPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
  onSelectClaim: (claimId: string) => void;
  onLaunchDemoScenario: (preset: "perfect" | "conflict") => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  appState,
  onNavigate,
  onSelectClaim,
  onLaunchDemoScenario,
}) => {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalClaims = appState.claims.length;
  const verifiedClaims = appState.claims.filter(
    (c) => c.status === "READY_FOR_FHIR" || c.status === "VERIFIED"
  ).length;
  const attentionClaims = appState.claims.filter(
    (c) => c.status === "NEEDS_REVIEW" || c.status === "PROCESSING" || c.status === "DRAFT"
  ).length;
  const pendingDocsCount = appState.findings.filter((f) => f.status === "FAIL").length;

  return (
    <div className="space-y-8 max-w-[1360px] mx-auto p-6 md:p-8">
      {/* Dashboard Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-widest">
            {currentDate} · HOSPITAL BILLING DESK
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0A0A0A] tracking-tight">
            Good morning, Administrator.
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] font-sans">
            All systems nominal. Local token vault active with 0 external PII leaks recorded.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onLaunchDemoScenario("perfect")}
            className="px-4 py-2.5 rounded-full bg-white hover:bg-[#F5F5F5] border-2 border-[#0A0A0A] text-[#0A0A0A] text-xs font-mono font-bold tracking-wider transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0022FF]" />
            RUN BENCHMARK AUDIT (100% PASS)
          </button>
          <button
            type="button"
            onClick={() => onNavigate("new-claim")}
            className="px-6 py-2.5 rounded-full bg-[#0022FF] hover:bg-[#0044FF] text-white text-xs font-mono font-bold tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            NEW CLAIM WORKFLOW
          </button>
        </div>
      </div>

      {/* High-Impact Numerical Metrics (Swiss Editorial Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs hover:border-[#0A0A0A] transition-colors">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#64748B] block">
            Total Ingested Claims
          </span>
          <div className="font-heading font-extrabold text-4xl sm:text-5xl text-[#0A0A0A] tabular-nums">
            {totalClaims.toString().padStart(2, "0")}
          </div>
          <div className="text-[11px] font-mono text-[#64748B]">
            Across 4 Insurer Policies (A1, A2, B1, B2)
          </div>
        </div>

        <div className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs hover:border-[#16834A] transition-colors">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#16834A] block">
            Verified & Gate-Ready
          </span>
          <div className="font-heading font-extrabold text-4xl sm:text-5xl text-[#16834A] tabular-nums">
            {verifiedClaims.toString().padStart(2, "0")}
          </div>
          <div className="text-[11px] font-mono text-[#16834A] font-semibold">
            ● FHIR R4 Bundle Unblocked
          </div>
        </div>

        <div className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs hover:border-[#E6A000] transition-colors">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#E6A000] block">
            Requires Attention
          </span>
          <div className="font-heading font-extrabold text-4xl sm:text-5xl text-[#E6A000] tabular-nums">
            {attentionClaims.toString().padStart(2, "0")}
          </div>
          <div className="text-[11px] font-mono text-[#64748B]">
            Awaiting Reviewer Disposition
          </div>
        </div>

        <div className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs hover:border-[#D93636] transition-colors">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#D93636] block">
            Missing Mandatory Docs
          </span>
          <div className="font-heading font-extrabold text-4xl sm:text-5xl text-[#D93636] tabular-nums">
            {pendingDocsCount.toString().padStart(2, "0")}
          </div>
          <div className="text-[11px] font-mono text-[#64748B]">
            Enforces Zero-Junk Gateway Gate
          </div>
        </div>
      </div>

      {/* Main Grid: Left 8 cols Recent Claims | Right 4 cols System & Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT: Recent Claims Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-xl text-[#0A0A0A]">
              Recent Claim Ingestions
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("all-claims")}
              className="text-xs font-mono font-bold text-[#0022FF] hover:underline flex items-center gap-1"
            >
              VIEW ALL CLAIMS ({totalClaims}) →
            </button>
          </div>

          <div className="bg-white border-2 border-[#0A0A0A] rounded-xs shadow-[4px_4px_0px_0px_#0A0A0A] overflow-hidden">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-[#0A0A0A] text-white border-b-2 border-[#0A0A0A]">
                  <th className="p-3.5 font-bold uppercase tracking-wider">Claim ID</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider">Policy & Insurer</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider">Diagnosis</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider">Date</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider">Readiness</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9D9D9]">
                {appState.claims.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#64748B]">
                      No claims ingested yet. Click &quot;New Claim Workflow&quot; to begin.
                    </td>
                  </tr>
                ) : (
                  appState.claims.slice(0, 6).map((claim) => {
                    const isReady =
                      claim.status === "READY_FOR_FHIR" || claim.status === "VERIFIED";
                    return (
                      <tr
                        key={claim.claim_id}
                        onClick={() => {
                          onSelectClaim(claim.claim_id);
                          onNavigate("results");
                        }}
                        className="hover:bg-[#F0F3FF] cursor-pointer transition-colors group"
                      >
                        <td className="p-3.5 font-bold text-[#0A0A0A] group-hover:text-[#0022FF]">
                          {claim.claim_id}
                        </td>
                        <td className="p-3.5 text-[#475569]">
                          {claim.insurer} · {claim.policy_code}
                        </td>
                        <td className="p-3.5 text-[#0A0A0A] font-semibold truncate max-w-[140px]">
                          {claim.diagnosis || "Auto-detecting..."}
                        </td>
                        <td className="p-3.5 text-[#64748B]">{claim.relevant_date}</td>
                        <td className="p-3.5">
                          {isReady ? (
                            <span className="inline-flex items-center gap-1 text-[#16834A] font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 100% READY
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#E6A000] font-bold">
                              <AlertTriangle className="w-3.5 h-3.5" /> NEEDS REVIEW
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          <span className="text-[#0022FF] group-hover:translate-x-1 inline-block transition-transform font-bold">
                            Inspect →
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: Active Claim Highlights & System Safeguards */}
        <div className="lg:col-span-4 space-y-6">
          {/* Active Claim Card */}
          {appState.active_claim ? (
            <div className="bg-[#FFFFFF] border-2 border-[#D9D9D9] p-6 space-y-4 rounded-xs">
              <div className="flex items-center justify-between border-b border-[#D9D9D9] pb-3">
                <span className="font-mono text-xs font-bold uppercase text-[#64748B]">
                  Currently Selected
                </span>
                <span className="text-xs font-mono font-bold bg-[#F0F3FF] text-[#0022FF] px-2 py-0.5 rounded-xs">
                  {appState.active_claim.policy_code}
                </span>
              </div>

              <div className="space-y-1">
                <div className="font-heading font-extrabold text-xl text-[#0A0A0A]">
                  {appState.active_claim.claim_id}
                </div>
                <div className="text-xs text-[#475569]">
                  {appState.active_claim.insurer}
                </div>
                <div className="text-xs font-mono text-[#0A0A0A] pt-1">
                  Diagnosis: <strong>{appState.active_claim.diagnosis || "Unspecified"}</strong>
                </div>
              </div>

              <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Documents:</span>
                  <span className="font-bold">{appState.documents.length} attached</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Findings:</span>
                  <span className="font-bold">{appState.findings.length} evaluated</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Gate Status:</span>
                  <span
                    className={`font-bold ${
                      appState.gate.allowed ? "text-[#16834A]" : "text-[#D93636]"
                    }`}
                  >
                    {appState.gate.allowed ? "UNBLOCKED" : "LOCKED"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigate("results")}
                className="w-full py-2.5 rounded-full bg-[#0022FF] hover:bg-[#0044FF] text-white font-mono text-xs font-bold tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                OPEN VERIFICATION RESULTS
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="bg-[#F5F5F5] border-2 border-dashed border-[#D9D9D9] p-6 text-center space-y-3 rounded-xs">
              <FileText className="w-8 h-8 text-[#94A3B8] mx-auto" />
              <div className="text-xs font-mono text-[#64748B]">
                No active claim selected for inspection.
              </div>
              <button
                type="button"
                onClick={() => onLaunchDemoScenario("perfect")}
                className="px-4 py-2 rounded-full bg-[#0A0A0A] text-white text-xs font-mono font-bold tracking-wider hover:bg-[#0022FF] transition-colors cursor-pointer"
              >
                PRELOAD BENCHMARK CLINICAL PACKET
              </button>
            </div>
          )}

          {/* System Safeguard Box */}
          <div className="bg-[#F0F3FF] border border-[#0022FF]/30 p-5 rounded-xs space-y-3 text-xs font-mono">
            <div className="font-bold text-[#0022FF] flex items-center gap-2 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-[#0022FF]" />
              Architectural Invariants
            </div>
            <ul className="space-y-1.5 text-[#334155] text-[11px]">
              <li>✓ Local PyMuPDF + Tesseract extraction</li>
              <li>✓ In-Memory PII Token Vault (0 leaks)</li>
              <li>✓ Deterministic SQLite Rule Registry</li>
              <li>✓ Gated HL7 FHIR R4 (4.0.1) Draft Bundle</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
