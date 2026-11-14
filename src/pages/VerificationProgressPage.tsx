import React from "react";
import {
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Cpu,
  FileCheck2,
  Sliders,
  Layers,
} from "lucide-react";
import { PageView } from "../types/claim";

interface VerificationProgressPageProps {
  claimId: string;
  insurer: string;
  policyCode: string;
  diagnosis: string;
  claimAmount?: string;
  isProcessing: boolean;
  onVerificationComplete: () => void;
  error?: string | null;
  onRetry?: () => void;
}

const STAGES = [
  {
    step: 1,
    title: "Reading claim documents & PDF bytes",
    detail: "Parsing digital text layers via PyMuPDF and checking Tesseract OCR fallback status.",
    icon: FileCheck2,
  },
  {
    step: 2,
    title: "Identifying applicable payer rules",
    detail: "Querying SQLite for approved, effective policy rules matching insurer and claim type.",
    icon: Sliders,
  },
  {
    step: 3,
    title: "Masking PII into local token vault",
    detail: "Replacing patient identifiers with deterministic per-claim tokens ([PATIENT_NAME_1]).",
    icon: ShieldCheck,
  },
  {
    step: 4,
    title: "Verifying required documents & line items",
    detail: "Checking presence of Clinical Summary, Lab Report, Discharge Summary, and Itemized Tariff.",
    icon: Layers,
  },
  {
    step: 5,
    title: "Evaluating cross-document consistency",
    detail: "Validating matching admission dates, patient IDs, and checking for pending test slips.",
    icon: Cpu,
  },
  {
    step: 6,
    title: "Generating assessment & checking FHIR gate",
    detail: "Synthesizing PASS/FAIL/REVIEW findings and compiling genuine HL7 FHIR R4 4.0.1 resources.",
    icon: CheckCircle2,
  },
];

export const VerificationProgressPage: React.FC<VerificationProgressPageProps> = ({
  claimId,
  insurer,
  policyCode,
  diagnosis,
  claimAmount,
  isProcessing,
  onVerificationComplete,
  error,
  onRetry,
}) => {
  const progressPct = isProcessing ? 8 : 100;

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white border-2 border-[#0A0A0A] p-8 sm:p-10 shadow-[8px_8px_0px_0px_#0A0A0A] rounded-xs space-y-8">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
          <div className="space-y-1">
            <div className="text-[11px] font-mono font-bold text-[#0022FF] uppercase tracking-wider">
              AUTOMATED VERIFICATION ENGINE
            </div>
            <h1 className="font-heading font-extrabold text-2xl text-[#0A0A0A]">
              Evaluating Claim Readiness
            </h1>
            <p className="text-xs text-[#64748B] font-mono">
              Running bounded orchestrator & SQLite rules engine locally.
            </p>
          </div>

          <div className="text-right font-mono text-xs">
            <span className="text-[#64748B] block text-[10px]">CLAIM REFERENCE</span>
            <span className="font-bold text-[#0A0A0A] text-sm">{claimId}</span>
          </div>
        </div>

        {/* Claim Context Pill Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs text-xs font-mono">
          <div>
            <span className="text-[10px] text-[#64748B] block">PAYER:</span>
            <span className="font-bold text-[#0A0A0A] truncate block">{insurer}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#64748B] block">POLICY:</span>
            <span className="font-bold text-[#0022FF] block">{policyCode}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#64748B] block">DIAGNOSIS:</span>
            <span className="font-bold text-[#0A0A0A] truncate block">{diagnosis || "Auto-detect"}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#64748B] block">AMOUNT:</span>
            <span className="font-bold text-[#0A0A0A] block">
              {claimAmount ? `₹${claimAmount}` : "Not captured"}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#64748B]">
              {isProcessing
                ? "LOCAL BACKEND EXECUTION IN PROGRESS"
                : "BACKEND VERIFICATION COMPLETE"}
            </span>
            <span className="font-bold text-[#0022FF]">{isProcessing ? `${progressPct}%` : "100%"}</span>
          </div>
          <div className="w-full bg-[#F5F5F5] h-2.5 rounded-full overflow-hidden border border-[#D9D9D9]">
            <div
              className="bg-[#0022FF] h-full transition-all duration-300 ease-out"
              style={{ width: `${isProcessing ? progressPct : 100}%` }}
            />
          </div>
        </div>

        {/* Error State */}
        {error ? (
          <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xs text-xs font-mono text-[#D93636] space-y-3">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>Verification Execution Failed</span>
            </div>
            <p>{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 bg-[#D93636] hover:bg-[#B91C1C] text-white rounded-xs font-bold tracking-wider cursor-pointer"
              >
                Retry Verification
              </button>
            )}
          </div>
        ) : (
          /* Animated Stages List */
          <div className="space-y-2.5">
            {STAGES.map((s, idx) => {
              const isPast = !isProcessing;
              const isCurrent = isProcessing && idx === 0;
              const Icon = s.icon;
              return (
                <div
                  key={s.step}
                  className={`p-3 border rounded-xs transition-all flex items-start gap-3 ${
                    isPast
                      ? "border-[#D9D9D9] bg-[#F5F5F5]/60 opacity-80"
                      : isCurrent
                      ? "border-[#0022FF] bg-[#F0F3FF]"
                      : "border-transparent text-[#94A3B8] opacity-40"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-[#16834A]" />
                    ) : isCurrent ? (
                      <RefreshCw className="w-4 h-4 text-[#0022FF] animate-spin" />
                    ) : (
                      <Icon className="w-4 h-4 text-[#94A3B8]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5 text-xs font-mono">
                    <div className={`font-bold ${isCurrent ? "text-[#0022FF]" : "text-[#0A0A0A]"}`}>
                      0{s.step}. {s.title}
                    </div>
                    {(isCurrent || !isProcessing) && <div className="text-[11px] text-[#475569]">{s.detail}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View Results Button */}
        {!error && !isProcessing && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onVerificationComplete}
              className="px-6 py-3 rounded-full bg-[#0A0A0A] hover:bg-[#0022FF] text-white font-mono text-xs font-bold tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
            >
              VIEW RESULTS & AUDIT TRAIL
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
