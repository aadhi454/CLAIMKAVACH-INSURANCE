import React, { useState } from "react";
import {
  ArrowRight,
  Sparkles,
  CheckCircle2,
  FileText,
  Sliders,
  FileCheck2,
  Cpu,
  ShieldCheck,
  Lock,
  Zap,
  Activity,
  Layers,
  Check,
} from "lucide-react";
import { PageView } from "../types/claim";
import { ClaimKavachLogo } from "../components/common/ClaimKavachLogo";

interface LandingPageProps {
  onNavigate: (view: PageView) => void;
  onLaunchDemoScenario: (preset: "perfect" | "conflict") => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  onLaunchDemoScenario,
}) => {
  const [activeTabSample, setActiveTabSample] = useState<"findings" | "fhir" | "privacy">("findings");

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] flex flex-col selection:bg-[#0022FF] selection:text-white font-sans">
      {/* HERO SECTION */}
      <section className="relative pt-12 pb-20 md:pt-16 md:pb-28 px-6 border-b border-[#D9D9D9] overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />

        <div className="max-w-[1360px] mx-auto relative z-10 space-y-10">
          {/* Top Architecture Pipeline Pill */}
          <div className="inline-flex flex-wrap items-center gap-2 px-4 py-1.5 rounded-full bg-[#F0F3FF] border border-[#0022FF]/30 text-[#0022FF] text-xs font-mono font-semibold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#0022FF] animate-pulse" />
            <span>AI-ASSISTED HOSPITAL CLAIM AUDIT GUARDRAIL</span>
            <span className="text-[#94A3B8] hidden sm:inline">·</span>
            <span className="text-[#0A0A0A] font-bold hidden sm:inline">HL7 FHIR R4 & NHCX COMPLIANT</span>
          </div>

          {/* Hero Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Heading, Subhead & Actions */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center gap-3">
                <ClaimKavachLogo size={52} variant="image" />
                <div>
                  <span className="font-heading font-extrabold text-2xl tracking-tight text-[#0A0A0A]">
                    CLAIM<span className="text-[#0022FF]">KAVACH</span>
                  </span>
                  <span className="text-[11px] font-mono text-[#64748B] block tracking-widest uppercase">
                    Zero-Dispute Pre-Submission Intelligence
                  </span>
                </div>
              </div>

              <h1 className="font-heading font-extrabold text-4xl sm:text-6xl lg:text-[72px] leading-[1.02] tracking-tight text-[#0A0A0A]">
                Insurance claims.
                <br />
                Verified before
                <br />
                they become{" "}
                <span className="text-[#0022FF] underline decoration-[#0022FF]/30 decoration-wavy">
                  disputes.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-[#475569] max-w-xl font-normal leading-relaxed">
                An intelligent healthcare claims verification platform that pre-audits hospital PDFs against
                insurer policy rules, flags missing documentation, and maps verified clinical evidence into
                gated HL7 FHIR R4 bundles — with <strong>zero patient PII leakage</strong>.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate("new-claim")}
                  className="px-8 py-4 rounded-full bg-[#0022FF] hover:bg-[#0044FF] text-white font-mono text-xs sm:text-sm font-bold tracking-wider transition-all shadow-md flex items-center gap-3 cursor-pointer group"
                >
                  START CLAIM AUDIT
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  type="button"
                  onClick={() => onLaunchDemoScenario("perfect")}
                  className="px-6 py-4 rounded-full bg-white hover:bg-[#F5F5F5] text-[#0A0A0A] border-2 border-[#0A0A0A] font-mono text-xs sm:text-sm font-bold tracking-wider transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  RUN BENCHMARK AUDIT (100% PASS)
                  <Sparkles className="w-4 h-4 text-[#0022FF]" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("login")}
                  className="px-4 py-4 text-xs font-mono font-bold text-[#64748B] hover:text-[#0A0A0A] transition-colors cursor-pointer"
                >
                  ENTERPRISE PORTAL →
                </button>
              </div>

              {/* Trust Badges */}
              <div className="pt-4 flex flex-wrap items-center gap-6 text-xs font-mono text-[#64748B]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16834A]" />
                  <span>100% On-Premise PII Masking</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16834A]" />
                  <span>Deterministic SQLite Rules</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#16834A]" />
                  <span>FHIR R4 (4.0.1) & NHCX Ready</span>
                </div>
              </div>
            </div>

            {/* Right Column: Creative Live Benchmark Audit Card */}
            <div className="lg:col-span-5">
              <div className="bg-white border-2 border-[#0A0A0A] p-6 sm:p-7 shadow-[8px_8px_0px_0px_#0A0A0A] space-y-5 rounded-xs relative">
                {/* Badge Header */}
                <div className="flex items-center justify-between border-b border-[#D9D9D9] pb-3">
                  <div className="flex items-center gap-2.5">
                    <ClaimKavachLogo size={24} variant="image" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                      Live Audit Sentinel
                    </span>
                  </div>
                  <span className="font-mono text-xs bg-[#F0FDF4] text-[#16834A] border border-[#BBF7D0] font-bold px-2.5 py-0.5 rounded-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#16834A] animate-pulse" />
                    ACTIVE NODE
                  </span>
                </div>

                {/* Score & Gauge */}
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xs font-mono text-[#64748B] block">CLAIM READINESS SCORE</span>
                      <span className="text-xs font-mono font-bold text-[#0A0A0A]">CLM-BENCHMARK-101 (Dengue Inpatient)</span>
                    </div>
                    <div className="text-right">
                      <span className="text-4xl sm:text-5xl font-heading font-extrabold text-[#0A0A0A]">
                        100<span className="text-[#0022FF]">%</span>
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-[#F5F5F5] h-2.5 rounded-full overflow-hidden border border-[#D9D9D9]">
                    <div className="bg-[#16834A] h-full w-full transition-all duration-500" />
                  </div>
                </div>

                {/* Evidence Metrics */}
                <div className="space-y-2 pt-2 border-t border-[#D9D9D9] text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#16834A] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 23 Quality Rules Evaluated
                    </span>
                    <span className="text-[#0A0A0A] font-bold">23 PASS · 0 FAIL · 0 REVIEW</span>
                  </div>
                  <div className="flex items-center justify-between text-[#475569]">
                    <span>Local PII Token Vault:</span>
                    <span className="font-bold text-[#0A0A0A]">Zero Cloud Leakage ([PATIENT_1])</span>
                  </div>
                  <div className="flex items-center justify-between text-[#475569]">
                    <span>Cross-Document Consistency:</span>
                    <span className="font-bold text-[#16834A]">Admission & Discharge Harmonized</span>
                  </div>
                  <div className="flex items-center justify-between text-[#475569]">
                    <span>HL7 FHIR R4 Bundle Gate:</span>
                    <span className="font-bold text-[#16834A] uppercase bg-[#F0FDF4] px-1.5 py-0.5 rounded-xs border border-[#BBF7D0]">
                      UNBLOCKED · READY TO EXPORT
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onLaunchDemoScenario("perfect")}
                    className="w-full py-3 rounded-xs bg-[#0A0A0A] hover:bg-[#0022FF] text-white font-mono text-xs font-bold tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    INSPECT BENCHMARK AUDIT RESULTS
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Banner */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-8 border-t border-[#D9D9D9]">
            <div className="p-4 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] block">PIPELINE AUDIT SPEED</span>
              <span className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0A0A0A]">&lt; 2.8s</span>
              <p className="text-[11px] text-[#64748B]">Complete extraction, classification & audit</p>
            </div>
            <div className="p-4 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] block">PRIVACY BOUNDARY</span>
              <span className="text-2xl sm:text-3xl font-heading font-extrabold text-[#16834A]">0 Bytes</span>
              <p className="text-[11px] text-[#64748B]">Raw patient PII sent to external cloud</p>
            </div>
            <div className="p-4 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] block">FHIR R4 STANDARD</span>
              <span className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0022FF]">100% Gated</span>
              <p className="text-[11px] text-[#64748B]">4.0.1 Bundle exported only upon full proof</p>
            </div>
            <div className="p-4 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
              <span className="text-[11px] font-mono text-[#64748B] block">RULE ACCURACY</span>
              <span className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0A0A0A]">Deterministic</span>
              <p className="text-[11px] text-[#64748B]">Versioned SQLite engine, zero hallucinations</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 01 — THE PROBLEM */}
      <section className="py-20 px-6 border-b border-[#D9D9D9] bg-[#F5F5F5]">
        <div className="max-w-[1360px] mx-auto space-y-12">
          <div className="max-w-2xl space-y-3">
            <span className="text-xs font-mono font-bold text-[#0022FF] uppercase tracking-widest">
              01 / THE HOSPITAL DISCHARGE BOTTLENECK
            </span>
            <h2 className="font-heading font-extrabold text-3xl sm:text-5xl text-[#0A0A0A] tracking-tight">
              Why health insurance claims get delayed or rejected.
            </h2>
            <p className="text-sm sm:text-base text-[#475569] leading-relaxed">
              Every day, hospital billing desks submit claims under intense discharge pressure.
              Clerical omissions and missing diagnostic evidence cause needless query cycles,
              blocking hospital cashflow and stranding patients.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border-2 border-[#D9D9D9] p-8 space-y-4 rounded-xs hover:border-[#0A0A0A] transition-colors">
              <div className="font-heading font-extrabold text-5xl text-[#D93636]">
                34%
              </div>
              <h3 className="font-heading font-bold text-lg text-[#0A0A0A]">
                Avoidable Pre-Submission Defects
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Claims get flagged because an itemized tariff breakdown was missing, a lab slip said &quot;Report Awaited&quot;, or the admission date conflicted between the doctor note and chart.
              </p>
            </div>

            <div className="bg-white border-2 border-[#D9D9D9] p-8 space-y-4 rounded-xs hover:border-[#0A0A0A] transition-colors">
              <div className="font-heading font-extrabold text-5xl text-[#E6A000]">
                14 Days
              </div>
              <h3 className="font-heading font-bold text-lg text-[#0A0A0A]">
                Average Dispute & Query Cycle
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                When an insurer flags an issue post-submission, billing clerks spend days retrieving physical charts, re-scanning documents, and answering TPA queries.
              </p>
            </div>

            <div className="bg-white border-2 border-[#D9D9D9] p-8 space-y-4 rounded-xs hover:border-[#0A0A0A] transition-colors">
              <div className="font-heading font-extrabold text-5xl text-[#0022FF]">
                ₹4,200 Cr
              </div>
              <h3 className="font-heading font-bold text-lg text-[#0A0A0A]">
                Working Capital Frozen Annually
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Hospitals shoulder massive liquidity strain due to pending cashless settlements. Pre-auditing claims before gateway transit eliminates post-facto rejections entirely.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 02 — THE SOLUTION */}
      <section id="how-it-works" className="py-20 px-6 border-b border-[#D9D9D9]">
        <div className="max-w-[1360px] mx-auto space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-4 sticky top-24">
              <span className="text-xs font-mono font-bold text-[#0022FF] uppercase tracking-widest">
                02 / ARCHITECTURAL APPROACH
              </span>
              <h2 className="font-heading font-extrabold text-3xl sm:text-5xl text-[#0A0A0A] tracking-tight">
                Shifting claim verification directly to the hospital desk.
              </h2>
              <p className="text-sm text-[#475569] leading-relaxed">
                Instead of submitting blindly and waiting for an insurer rejection letter, ClaimKavach functions as a pre-flight guardrail.
                It inspects hospital PDFs, masks patient PII locally, evaluates versioned insurer rules deterministically, and gates the export of FHIR R4 standard bundles.
              </p>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => onNavigate("new-claim")}
                  className="px-6 py-3 rounded-full bg-[#0A0A0A] hover:bg-[#0022FF] text-white font-mono text-xs font-bold tracking-wider transition-colors inline-flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  START INGESTION WORKFLOW →
                </button>
              </div>
            </div>

            {/* 4-Step Workflow Grid */}
            <div className="lg:col-span-7 space-y-4">
              {[
                {
                  step: "01",
                  title: "Document Ingestion & Local Provenance",
                  desc: "Hospital billing clerk uploads PDFs (Discharge Summary, Investigation Report, Itemized Estimate). PyMuPDF and OCR extract digital text with exact page and line coordinates.",
                  badge: "PyMuPDF + Local OCR",
                },
                {
                  step: "02",
                  title: "Deterministic PII Token Vault",
                  desc: "Before any reasoning, patient name, Aadhaar, PAN, phone, and policy IDs are mapped into a local per-claim vault ([PATIENT_NAME_1]). Zero unmasked patient data leaves the local node.",
                  badge: "Privacy Guarantee",
                },
                {
                  step: "03",
                  title: "Deterministic Payer Rule Audit",
                  desc: "The rules engine queries approved insurer rules from SQLite, evaluating required documents, line-item breakdowns, pending test slips ('Report Awaited'), and cross-document admission dates.",
                  badge: "PASS / FAIL / REVIEW",
                },
                {
                  step: "04",
                  title: "Human Review & Gated FHIR R4 Export",
                  desc: "Clerks resolve any REVIEW discrepancies with signed rationales. Once all criteria pass, the system unlocks the gate and builds a genuine HL7 FHIR R4 4.0.1 draft bundle.",
                  badge: "Gated FHIR R4",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="bg-white border-2 border-[#D9D9D9] p-6 space-y-2 rounded-xs hover:border-[#0022FF] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-extrabold text-2xl text-[#0022FF]">
                      {item.step}
                    </span>
                    <span className="text-[10px] font-mono font-bold bg-[#F0F3FF] text-[#0022FF] px-2 py-0.5 rounded-xs border border-[#0022FF]/30 uppercase">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="font-heading font-bold text-lg text-[#0A0A0A]">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 03 — THREE CORE CAPABILITIES */}
      <section id="capabilities" className="py-20 px-6 border-b border-[#D9D9D9] bg-[#F5F5F5]">
        <div className="max-w-[1360px] mx-auto space-y-12">
          <div className="max-w-xl space-y-2">
            <span className="text-xs font-mono font-bold text-[#0022FF] uppercase tracking-widest">
              03 / CORE CAPABILITIES
            </span>
            <h2 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0A0A0A]">
              Three interconnected intelligence engines.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border-2 border-[#D9D9D9] p-8 space-y-4 rounded-xs">
              <div className="w-12 h-12 bg-[#F0F3FF] text-[#0022FF] flex items-center justify-center rounded-xs font-bold">
                <Sliders className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-bold text-xl text-[#0A0A0A]">
                Policy Intelligence
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Deterministic condition matching against versioned insurer policies.
                Tracks sub-limits, room rent caps, exclusion periods, and required document profiles without guesswork.
              </p>
              <ul className="text-xs font-mono space-y-1.5 text-[#0A0A0A] pt-2">
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> Versioned SQLite Rule Registry
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> Payer-Specific Criteria (A1, A2, B1, B2)
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> Live Rule Approval Lifecycle
                </li>
              </ul>
            </div>

            <div className="bg-white border-2 border-[#D9D9D9] p-8 space-y-4 rounded-xs">
              <div className="w-12 h-12 bg-[#F0F3FF] text-[#0022FF] flex items-center justify-center rounded-xs font-bold">
                <FileCheck2 className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-bold text-xl text-[#0A0A0A]">
                Document Provenance
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Extracts clinical, billing, and identity fields with exact page number and line coordinates.
                Detects pending lab indicators (&quot;Sample Sent — Report Awaited&quot;) and conflicting values across documents.
              </p>
              <ul className="text-xs font-mono space-y-1.5 text-[#0A0A0A] pt-2">
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> Page & Line Coordinates (p.1 L.14)
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> Cross-Document Conflict Detection
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> OCR Raster Image Fallback
                </li>
              </ul>
            </div>

            <div className="bg-white border-2 border-[#D9D9D9] p-8 space-y-4 rounded-xs">
              <div className="w-12 h-12 bg-[#F0F3FF] text-[#0022FF] flex items-center justify-center rounded-xs font-bold">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="font-heading font-bold text-xl text-[#0A0A0A]">
                Gated FHIR R4 & NHCX
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Converts validated hospital paperwork into authentic HL7 FHIR R4 (4.0.1) Bundles.
                Strict backend gate guarantees that zero incomplete claims can ever be exported or submitted.
              </p>
              <ul className="text-xs font-mono space-y-1.5 text-[#0A0A0A] pt-2">
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> Strict Pre-Export Quality Gate
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> Genuine HL7 FHIR R4 4.0.1 Schema
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#0022FF]">■</span> Local Mock NHCX Gateway Sandbox
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 04 — REAL-TIME INSPECTION AUDIT */}
      <section id="sample-audit" className="py-20 px-6 border-b border-[#D9D9D9]">
        <div className="max-w-[1360px] mx-auto space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold text-[#0022FF] uppercase tracking-widest">
                04 / BENCHMARK AUDIT PREVIEW
              </span>
              <h2 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0A0A0A]">
                Live claim inspection output.
              </h2>
              <p className="text-xs sm:text-sm text-[#475569]">
                Interactive inspection of an Inpatient Dengue claim evaluated under Insurer A (Policy A1).
              </p>
            </div>

            <div className="flex items-center gap-1 bg-[#F5F5F5] p-1 border border-[#D9D9D9] rounded-xs font-mono text-xs">
              <button
                type="button"
                onClick={() => setActiveTabSample("findings")}
                className={`px-3 py-1.5 font-bold transition-all rounded-xs cursor-pointer ${
                  activeTabSample === "findings" ? "bg-[#0A0A0A] text-white" : "text-[#475569] hover:text-[#0A0A0A]"
                }`}
              >
                CHECKLIST (23 CHECKS)
              </button>
              <button
                type="button"
                onClick={() => setActiveTabSample("fhir")}
                className={`px-3 py-1.5 font-bold transition-all rounded-xs cursor-pointer ${
                  activeTabSample === "fhir" ? "bg-[#0A0A0A] text-white" : "text-[#475569] hover:text-[#0A0A0A]"
                }`}
              >
                GATED FHIR R4 BUNDLE
              </button>
              <button
                type="button"
                onClick={() => setActiveTabSample("privacy")}
                className={`px-3 py-1.5 font-bold transition-all rounded-xs cursor-pointer ${
                  activeTabSample === "privacy" ? "bg-[#0A0A0A] text-white" : "text-[#475569] hover:text-[#0A0A0A]"
                }`}
              >
                TOKEN VAULT PREVIEW
              </button>
            </div>
          </div>

          {/* Interactive Card Container */}
          <div className="bg-[#FFFFFF] border-2 border-[#0A0A0A] rounded-xs p-6 shadow-[8px_8px_0px_0px_#0A0A0A]">
            {activeTabSample === "findings" && (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[#D9D9D9]">
                  <span className="font-bold text-[#0A0A0A]">RULE & EVIDENCE CHECKLIST</span>
                  <span className="text-[#16834A] font-bold">100% READY · ZERO BLOCKING FINDINGS</span>
                </div>

                <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#16834A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-xs">
                        PASS
                      </span>
                      <strong className="text-[#0A0A0A]">RULE-A1-DOC-CORE</strong>
                      <span className="text-[#64748B]">· 01_clinical_summary.pdf (p.1)</span>
                    </div>
                    <p className="text-[#475569]">
                      Mandatory Clinical Summary, Lab Report, Discharge Summary, and Itemized Estimate confirmed present.
                    </p>
                  </div>
                  <span className="text-[10px] text-[#16834A] font-bold uppercase shrink-0">
                    VERIFIED EVIDENCE
                  </span>
                </div>

                <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#16834A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-xs">
                        PASS
                      </span>
                      <strong className="text-[#0A0A0A]">R-DEN-01</strong>
                      <span className="text-[#64748B]">· 02_investigation_report.pdf (p.1 L.14)</span>
                    </div>
                    <p className="text-[#475569]">
                      Dengue serology confirmed: NS1 Antigen POSITIVE (Reactive), Platelet count: 58,000 /uL. No awaited slips.
                    </p>
                  </div>
                  <span className="text-[10px] text-[#16834A] font-bold uppercase shrink-0">
                    CLINICAL CONDITION
                  </span>
                </div>

                <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#16834A] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-xs">
                        PASS
                      </span>
                      <strong className="text-[#0A0A0A]">CONSISTENCY-ADMISSION_DATE</strong>
                      <span className="text-[#64748B]">· Cross-Doc Check</span>
                    </div>
                    <p className="text-[#475569]">
                      Admission date consistent across Clinical Summary (2026-10-10) and Discharge Summary (2026-10-10).
                    </p>
                  </div>
                  <span className="text-[10px] text-[#16834A] font-bold uppercase shrink-0">
                    DATE HARMONY
                  </span>
                </div>
              </div>
            )}

            {activeTabSample === "fhir" && (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[#D9D9D9]">
                  <span className="font-bold text-[#0A0A0A]">HL7 FHIR R4 (4.0.1) DRAFT BUNDLE</span>
                  <span className="text-[#0022FF] font-bold">9 RESOURCES VALIDATED</span>
                </div>
                <pre className="p-4 bg-[#0A0A0A] text-[#E2E8F0] overflow-x-auto max-h-64 rounded-xs text-[11px]">
{`{
  "resourceType": "Bundle",
  "id": "bundle-clm-100-perfect",
  "type": "collection",
  "timestamp": "2026-11-13T19:16:00Z",
  "total": 9,
  "entry": [
    { "fullUrl": "Patient/pat-clm-100", "resource": { "resourceType": "Patient", "id": "pat-clm-100", "name": [{"text": "[PATIENT_NAME_1]"}] } },
    { "fullUrl": "Condition/cond-clm-100", "resource": { "resourceType": "Condition", "code": { "text": "Dengue Fever" } } },
    { "fullUrl": "Claim/clm-100", "resource": { "resourceType": "Claim", "status": "draft", "total": { "value": 42500, "currency": "INR" } } }
  ]
}`}
                </pre>
              </div>
            )}

            {activeTabSample === "privacy" && (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between pb-3 border-b border-[#D9D9D9]">
                  <span className="font-bold text-[#0A0A0A]">MASKED OUTBOUND PAYLOAD PREVIEW</span>
                  <span className="text-[#16834A] font-bold">ZERO UNMASKED PII EXPOSURE</span>
                </div>
                <div className="p-4 bg-[#F0F3FF] border border-[#0022FF]/30 text-[#0022FF] space-y-1">
                  <div><strong>PATIENT TOKEN:</strong> [PATIENT_NAME_1] (Maps locally to UHID-SYN-90412)</div>
                  <div><strong>POLICY TOKEN:</strong> [POLICY_ID_1] (Maps locally to POL-A1-778899)</div>
                  <div><strong>DOCTOR TOKEN:</strong> [DOCTOR_1] (Dr. Meera Nair)</div>
                  <div><strong>LOCAL STORAGE:</strong> Processed in-memory; raw files never sent to external cloud.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 05 — COMPARISON MATRIX */}
      <section className="py-20 px-6 border-b border-[#D9D9D9] bg-[#F5F5F5]">
        <div className="max-w-[1360px] mx-auto space-y-12">
          <div className="max-w-xl space-y-2">
            <span className="text-xs font-mono font-bold text-[#0022FF] uppercase tracking-widest">
              05 / WHY CLAIMKAVACH
            </span>
            <h2 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0A0A0A]">
              Traditional submission vs ClaimKavach.
            </h2>
          </div>

          <div className="bg-white border-2 border-[#0A0A0A] rounded-xs overflow-x-auto shadow-sm">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-[#0A0A0A] bg-[#0A0A0A] text-white">
                  <th className="p-4 font-bold uppercase tracking-wider">Evaluation Dimension</th>
                  <th className="p-4 font-bold uppercase tracking-wider text-[#94A3B8]">Traditional Hospital Desk</th>
                  <th className="p-4 font-bold uppercase tracking-wider text-[#38BDF8]">ClaimKavach Architecture</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9D9D9]">
                <tr>
                  <td className="p-4 font-bold text-[#0A0A0A]">Data Extraction</td>
                  <td className="p-4 text-[#D93636]">Manual typing of 25+ fields across billing software.</td>
                  <td className="p-4 text-[#16834A] font-bold">Automated PyMuPDF & OCR extraction with line coordinates.</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-[#0A0A0A]">Patient PII Privacy</td>
                  <td className="p-4 text-[#D93636]">Raw unmasked PDFs sent over email and cloud portals.</td>
                  <td className="p-4 text-[#16834A] font-bold">Local-first token vault; zero raw PII leaves hospital network.</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-[#0A0A0A]">Audit Provenance</td>
                  <td className="p-4 text-[#D93636]">Clerks search physical paper folders during query disputes.</td>
                  <td className="p-4 text-[#16834A] font-bold">Exact page number, line coordinate, and text excerpt for every field.</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-[#0A0A0A]">Submission Gate</td>
                  <td className="p-4 text-[#D93636]">Claims submitted blind; 34% rejected post-facto.</td>
                  <td className="p-4 text-[#16834A] font-bold">Strict backend gate locks FHIR export until all criteria pass.</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-[#0A0A0A]">Payer Rule Logic</td>
                  <td className="p-4 text-[#D93636]">Manual memory or outdated 100-page policy manuals.</td>
                  <td className="p-4 text-[#16834A] font-bold">Deterministic SQLite rules engine with versioned conditions.</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-[#0A0A0A]">NHCX / ABDM Standards</td>
                  <td className="p-4 text-[#D93636]">Legacy non-standard scanned PDFs and manual portal forms.</td>
                  <td className="p-4 text-[#16834A] font-bold">Genuine HL7 FHIR R4 4.0.1 bundles with local Mock NHCX simulator.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FINAL HIGH-IMPACT CTA */}
      <section className="py-24 px-6 bg-[#0022FF] text-white">
        <div className="max-w-[1360px] mx-auto text-center space-y-8">
          <div className="w-16 h-16 mx-auto bg-white rounded-full flex items-center justify-center p-2 shadow-lg">
            <ClaimKavachLogo size={42} variant="image" />
          </div>
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-white/80 block">
            ENTERPRISE PRE-SUBMISSION SENTINEL
          </span>
          <h2 className="font-heading font-extrabold text-4xl sm:text-6xl max-w-3xl mx-auto leading-tight">
            Stop insurance rejections before they happen.
          </h2>
          <p className="text-base text-white/80 max-w-xl mx-auto font-sans">
            Ready to experience the zero-dispute claims workflow? Preload the benchmark clinical packet or upload hospital records.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              type="button"
              onClick={() => onNavigate("new-claim")}
              className="px-8 py-4 rounded-full bg-white hover:bg-[#F5F5F5] text-[#0022FF] font-mono text-sm font-bold tracking-wider transition-all shadow-lg flex items-center gap-2 cursor-pointer"
            >
              LAUNCH CLAIM WORKSPACE
              <ArrowRight className="w-4 h-4 text-[#0022FF]" />
            </button>
            <button
              type="button"
              onClick={() => onLaunchDemoScenario("perfect")}
              className="px-6 py-4 rounded-full border-2 border-white text-white hover:bg-white/10 font-mono text-sm font-bold tracking-wider transition-colors cursor-pointer"
            >
              RUN BENCHMARK AUDIT
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
