import React from "react";
import { ArrowUpRight } from "lucide-react";
import { PageView } from "../../types/claim";
import { ClaimKavachLogo } from "../common/ClaimKavachLogo";

interface FooterProps {
  onNavigate: (view: PageView) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-[#0A0A0A] text-white border-t border-[#262626] pt-16 pb-12 mt-auto">
      <div className="max-w-[1360px] mx-auto px-6 space-y-12">
        {/* Top Editorial Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-12 border-b border-[#262626]">
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-3">
              <ClaimKavachLogo size={32} variant="image" />
              <span className="font-heading font-extrabold text-xl tracking-tight">
                CLAIM<span className="text-[#0022FF]">KAVACH</span>
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] max-w-sm font-sans leading-relaxed">
              Intelligent hospital claim pre-submission readiness assistant.
              Validates policy rules, detects missing documentation, and exports
              gated HL7 FHIR R4 standard bundles directly at the hospital billing desk.
            </p>
            <div className="pt-2 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#16834A] animate-pulse" />
              <span className="text-[11px] font-mono text-[#94A3B8] uppercase">
                Local-First Engine Active · Zero Cloud PII Exposure
              </span>
            </div>
          </div>

          <div className="md:col-span-2 space-y-3">
            <div className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Navigation
            </div>
            <ul className="space-y-2 text-xs font-mono text-[#94A3B8]">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("landing")}
                  className="hover:text-white transition-colors"
                >
                  Overview
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("new-claim")}
                  className="hover:text-white transition-colors"
                >
                  New Claim
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("all-claims")}
                  className="hover:text-white transition-colors"
                >
                  Claims Registry
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("policies")}
                  className="hover:text-white transition-colors"
                >
                  Policy Catalog
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate("rules")}
                  className="hover:text-white transition-colors"
                >
                  Rules Engine
                </button>
              </li>
            </ul>
          </div>

          <div className="md:col-span-2 space-y-3">
            <div className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Standards
            </div>
            <ul className="space-y-2 text-xs font-mono text-[#94A3B8]">
              <li className="flex items-center gap-1">
                <span>HL7 FHIR R4 (4.0.1)</span>
              </li>
              <li>National Health Claims (NHCX)</li>
              <li>ABDM / NRCES Compliant</li>
              <li>Tesseract OCR 5.0</li>
              <li>PyMuPDF Digital Text</li>
            </ul>
          </div>

          <div className="md:col-span-3 space-y-3">
            <div className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Quick Demo Access
            </div>
            <p className="text-xs text-[#94A3B8]">
              Explore the complete 5-step claim ingestion and verification workflow with pre-seeded hospital scenarios.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("new-claim")}
              className="mt-2 px-4 py-2 rounded-full bg-[#0022FF] hover:bg-[#0044FF] text-white text-xs font-mono font-bold tracking-wider flex items-center gap-2 transition-all"
            >
              LAUNCH INTERACTIVE DEMO
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Regulatory & Scope Boundary Disclosures */}
        <div className="p-4 bg-[#141414] border border-[#262626] rounded-xs space-y-2 text-[11px] font-mono text-[#94A3B8]">
          <div className="text-white font-bold tracking-wider flex items-center gap-2">
            <span className="text-[#E6A000]">MANDATORY LIMITATION & BOUNDARY DISCLOSURE</span>
          </div>
          <p>
            • <strong>FHIR R4 STRUCTURE CHECKED — NHCX/HCX PROFILE VALIDATION NOT IMPLEMENTED:</strong> FHIR R4 structural validation is not NHCX/HCX profile conformance. Live gateway access, live claim submission, and adjudication are not implemented.
          </p>
          <p>
            • <strong>SYNTHETIC DEMO DATA:</strong> All insurers (Fictional Insurer A, Fictional Insurer B), policies (A1, A2, B1, B2), rules, and patient PDFs are synthetic demonstration data.
          </p>
          <p>
            • <strong>LOCAL PRIVACY BOUNDARY:</strong> Regex and token-based masking reduces obvious identifier exposure into local vaults. Never promises de-identification guarantees or live insurer approval.
          </p>
        </div>

        {/* Bottom Copyright */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[#64748B]">
          <div>
            © 2026 ClaimKavach — Built for Swiss Post-Modern Healthcare Engineering.
          </div>
          <div className="flex items-center gap-4">
            <span className="hover:text-white transition-colors cursor-pointer" onClick={() => onNavigate("landing")}>Privacy Policy</span>
            <span>·</span>
            <span className="hover:text-white transition-colors cursor-pointer" onClick={() => onNavigate("landing")}>Terms of Service</span>
            <span>·</span>
            <span className="text-[#0022FF] font-bold">Hackathon Demo Release</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
