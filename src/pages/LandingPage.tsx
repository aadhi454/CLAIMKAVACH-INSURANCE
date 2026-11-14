import React, { useState } from "react";
import { ArrowRight, Check, Copy, LockKeyhole, ShieldCheck } from "lucide-react";
import { PageView } from "../types/claim";
import { ClaimKavachLogo } from "../components/common/ClaimKavachLogo";

interface LandingPageProps {
  onNavigate: (view: PageView) => void;
  onLaunchDemoScenario: (preset: "perfect" | "conflict") => void;
  onNavigateToApiKeys: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onNavigateToApiKeys }) => {
  const [copied, setCopied] = useState(false);
  const preview = `curl -X POST http://localhost:3000/api/v1/audit-claim \\\n  -H "Authorization: Bearer ck_live_98a4..." \\\n  -H "Content-Type: application/json"`;
  const copyPreview = async () => {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return <div className="landing-shell min-h-screen text-[#0B192C]">
    <header className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-5">
      <button type="button" onClick={() => onNavigate("landing")} className="flex items-center gap-3 text-left">
        <ClaimKavachLogo size={42} variant="image" />
        <span className="font-heading text-xl font-extrabold tracking-tight">CLAIM<span className="text-[#0052FF]">KAVACH</span></span>
      </button>
      <nav className="hidden items-center gap-7 text-sm font-medium text-[#475569] md:flex">
        <a href="#architecture">Architecture</a><a href="#rulebook">10-Case Rulebook</a><a href="#api-docs">API Docs</a><a href="#compliance">NHCX Compliance</a>
      </nav>
      <button type="button" onClick={() => onNavigate("login")} className="inline-flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-white px-4 py-2.5 text-xs font-bold text-[#0B192C] shadow-sm transition hover:border-[#0052FF] hover:text-[#0052FF]">
        <LockKeyhole className="h-3.5 w-3.5" /> Admin Desk Login
      </button>
    </header>
    <main className="mx-auto max-w-[1320px] px-6 pb-12 pt-10 lg:pt-16">
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#BFDBFE] bg-white px-3 py-1.5 text-[11px] font-bold tracking-[.12em] text-[#0052FF]"><span className="h-2 w-2 rounded-full bg-[#15803D]" /> LOCAL-FIRST CLAIM ASSURANCE</div>
          <h1 className="font-heading text-5xl font-extrabold leading-[.9] tracking-[-.065em] text-[#0B192C] sm:text-7xl lg:text-[92px]">CLAIM<br /><span className="text-[#0052FF]">KAVACH</span></h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-[#475569] sm:text-lg">Deterministic Pre-Submission Claim Firewall. Catch missing clinical evidence, mask patient PII locally, and generate NHCX-ready FHIR R4 bundles before the IRDAI 1-hour SLA clock runs out.</p>
          <button type="button" onClick={() => onNavigate("login")} className="mt-8 inline-flex items-center gap-3 rounded-xl bg-[#0052FF] px-6 py-4 text-sm font-bold text-white shadow-[0_14px_28px_-12px_rgba(0,82,255,.7)] transition hover:-translate-y-0.5 hover:bg-[#0044D6]">Enter Hospital Desk <ArrowRight className="h-4 w-4" /></button>
        </div>
        <button aria-label="Enter Hospital Desk" type="button" onClick={() => onNavigate("login")} className="shield-stage group mx-auto w-full max-w-md cursor-pointer rounded-[2rem] border border-white/80 bg-white/55 p-10 shadow-[0_20px_70px_-35px_rgba(11,25,44,.35)]"><div className="shield-orbit shield-orbit-one" /><div className="shield-orbit shield-orbit-two" /><div className="shield-face transition duration-300 group-hover:scale-105"><ClaimKavachLogo size={230} variant="image" /></div><div className="shield-core-label"><ShieldCheck className="h-3.5 w-3.5 text-[#0052FF]" /> VERIFIED DOCUMENT FIREWALL</div></button>
      </section>
      <section id="api-docs" className="mt-16 rounded-2xl border border-[#CBD5E1] bg-white p-6 shadow-[0_20px_50px_-30px_rgba(11,25,44,.3)] md:p-10">
        <div className="max-w-3xl">
          <div className="text-xs font-mono font-bold tracking-[.14em] text-[#0052FF]">HOSPITAL API · DEVELOPER ACCESS</div>
          <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-[#0B192C] sm:text-4xl">Plug Into Any Hospital ERP in 5 Minutes — No Portal Switching.</h2>
          <p className="mt-4 text-base leading-7 text-[#475569]">Use ClaimKavach as a standalone billing desk or connect our deterministic firewall directly into your existing HMIS/HIS via a single authenticated REST endpoint.</p>
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="flex flex-wrap gap-2">
              {["REST JSON / Multipart PDF", "Auth: Bearer ck_live_...", "Avg Latency: < 450ms", "Output: NHCX FHIR R4 ClaimBundle"].map((badge) => <span key={badge} className="rounded-full border border-[#BFDBFE] bg-[#EEF5FC] px-3 py-1.5 text-[11px] font-mono font-bold text-[#0B192C]">{badge}</span>)}
            </div>
            <ul className="mt-6 space-y-4 text-sm leading-6 text-[#475569]">
              <li>• Send clinical PDFs and claim metadata from the discharge screen to <code className="rounded bg-[#EEF5FC] px-1.5 py-0.5 font-mono text-[#0052FF]">POST /api/v1/audit-claim</code>.</li>
              <li>• Receive a deterministic <strong className="text-[#15803D]">PASS</strong> or <strong className="text-[#DC2626]">BLOCKED</strong> verdict with rule IDs and remediation.</li>
              <li>• Release the NHCX/FHIR R4 handoff only when the backend evidence gate is clear.</li>
            </ul>
            <button type="button" onClick={onNavigateToApiKeys} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#0052FF] px-5 py-3.5 text-sm font-bold text-white shadow-[0_14px_28px_-12px_rgba(0,82,255,.7)] transition hover:bg-[#0044D6]">Generate Hospital API Key <ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="rounded-xl bg-[#0B192C] p-5 text-[#E2E8F0] shadow-[0_16px_30px_-18px_rgba(11,25,44,.7)]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3"><span className="text-[11px] font-mono font-bold tracking-[.12em] text-[#93C5FD]">LIVE REQUEST / DETERMINISTIC RESPONSE</span><button type="button" onClick={() => void copyPreview()} className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2.5 py-1.5 text-[10px] font-mono font-bold text-white hover:border-[#93C5FD]">{copied ? <Check className="h-3.5 w-3.5 text-[#86EFAC]" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "COPIED" : "COPY"}</button></div>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-[#BFDBFE]">{preview}</pre>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-[#12243B] p-4 text-[11px] leading-5 text-[#FCA5A5]">{`{\n  "status": "BLOCKED",\n  "missing_documents": ["R-DEN-04: NS1 Antigen Lab Report"],\n  "nhcx_gateway_ready": false\n}`}</pre>
          </div>
        </div>
      </section>
      <section id="architecture" className="mt-16 grid gap-4 border-t border-[#CBD5E1] pt-5 md:grid-cols-3">
        {[["01", "Local PII Redaction", "Patient identifiers are tokenized before extraction leaves the local trust boundary."], ["02", "Deterministic Rule Matrix", "SQLite-backed evidence checks make every pass and failure auditable."], ["03", "Gated NHCX FHIR R4 Output", "A ClaimBundle unlocks only once every mandatory evidence gate is clear."]].map(([number, title, copy]) => <div key={number} className="rounded-xl border border-[#CBD5E1] bg-white p-5 shadow-[0_10px_30px_-10px_rgba(11,25,44,.08)]"><div className="text-xs font-bold text-[#0052FF]">{number}</div><h2 className="mt-5 font-heading text-lg font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#475569]">{copy}</p></div>)}
      </section><div id="rulebook" className="sr-only">10-case SQLite rulebook</div><div id="compliance" className="sr-only">NHCX FHIR R4 compliance</div>
    </main>
  </div>;
};
