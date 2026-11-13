import React from "react";
import {
  Settings,
  ShieldCheck,
  Cpu,
  Lock,
  Layers,
  FileCheck2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { AppState, PageView } from "../types/claim";

interface SettingsPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  appState,
  onNavigate,
}) => {
  const system = appState.system;
  const auditLogs = appState.audit_logs || [];

  return (
    <div className="max-w-[1360px] mx-auto p-6 md:p-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-widest">
            SYSTEM ARCHITECTURE & SECURITY
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#0A0A0A] tracking-tight">
            Settings & Operational Invariants
          </h1>
          <p className="text-xs text-[#64748B]">
            Hardware configuration, PII vault settings, OCR capabilities, and audit logs.
          </p>
        </div>

        <div className="px-3 py-1.5 bg-[#F0F3FF] border border-[#0022FF]/30 text-[#0022FF] font-mono text-xs font-bold rounded-xs shrink-0">
          MODE: {system.default_mode}
        </div>
      </div>

      {/* Grid: 3 System Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
        <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-[#0A0A0A] uppercase border-b border-[#D9D9D9] pb-2">
            <Cpu className="w-4 h-4 text-[#0022FF]" />
            AI Orchestrator Engine
          </div>
          <div>
            <span className="text-[#64748B] block">Gemini API Status:</span>
            <strong className={system.gemini_configured ? "text-[#16834A]" : "text-[#E6A000]"}>
              {system.gemini_configured ? "ACTIVE (GEMINI_MASKED)" : "DEMO FALLBACK (DETERMINISTIC LOCAL)"}
            </strong>
          </div>
          <div>
            <span className="text-[#64748B] block">Tool Execution Turn Bound:</span>
            <strong className="text-[#0A0A0A]">MAX_TOOL_TURNS = 7</strong>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed pt-2 border-t border-[#D9D9D9]">
            When Gemini API key is absent or fallback is forced, ClaimKavach operates 100% deterministically using local Python extraction.
          </p>
        </div>

        <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-[#0A0A0A] uppercase border-b border-[#D9D9D9] pb-2">
            <ShieldCheck className="w-4 h-4 text-[#16834A]" />
            Deterministic Token Vault
          </div>
          <div>
            <span className="text-[#64748B] block">PII Isolation:</span>
            <strong className="text-[#16834A]">ENFORCED ON ALL OUTBOUND PAYLOADS</strong>
          </div>
          <div>
            <span className="text-[#64748B] block">Tokens Seeded:</span>
            <strong className="text-[#0A0A0A]">[PATIENT_NAME_1], [PHONE_1], [POLICY_ID_1]</strong>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed pt-2 border-t border-[#D9D9D9]">
            Obvious patient identifiers are replaced in-memory before trace logging or optional model assistance. Raw PDFs never leave the hospital network.
          </p>
        </div>

        <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-3 shadow-sm">
          <div className="flex items-center gap-2 font-bold text-[#0A0A0A] uppercase border-b border-[#D9D9D9] pb-2">
            <FileCheck2 className="w-4 h-4 text-[#0022FF]" />
            OCR & Document Processing
          </div>
          <div>
            <span className="text-[#64748B] block">Digital Text Extraction:</span>
            <strong className="text-[#0A0A0A]">PyMuPDF (fitz) Active</strong>
          </div>
          <div>
            <span className="text-[#64748B] block">Tesseract OCR 5.0:</span>
            <strong className={system.tesseract_available ? "text-[#16834A]" : "text-[#64748B]"}>
              {system.tesseract_available ? "INSTALLED (AUTO-FALLBACK)" : "LOCAL SCAN FALLBACK ROUTED TO REVIEW"}
            </strong>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed pt-2 border-t border-[#D9D9D9]">
            Enforces %PDF magic-byte validation, 20 MB size ceiling, and flags unreadable raster scans for human review without crashing.
          </p>
        </div>
      </div>

      {/* SQLite Audit Trail Logs */}
      <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-[#D9D9D9]">
          <h2 className="font-heading font-extrabold text-lg text-[#0A0A0A]">
            SQLite Audit Trail ({auditLogs.length} Events)
          </h2>
          <span className="text-[11px] text-[#64748B]">IMMUTABLE AUDIT LOGS</span>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-[#64748B]">
              No audit logs recorded for this claim.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.audit_id}
                className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#0022FF]">{log.action}</span>
                  <span className="text-[#64748B]">{log.timestamp}</span>
                </div>
                <div className="text-[#0A0A0A]">
                  Actor: <strong>{log.actor}</strong> {log.claim_id ? `· Claim: ${log.claim_id}` : ""}
                </div>
                <p className="text-[#475569]">{log.redacted_details}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
