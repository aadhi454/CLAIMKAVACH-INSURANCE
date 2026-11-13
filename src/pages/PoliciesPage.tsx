import React, { useState } from "react";
import {
  FolderOpen,
  ShieldCheck,
  CheckCircle2,
  FileText,
  AlertCircle,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { AppState, PageView, PolicyConfig } from "../types/claim";

interface PoliciesPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
}

const POLICY_DETAILS_MAP: Record<
  string,
  {
    category: string;
    coverageLimit: string;
    roomRent: string;
    icuCap: string;
    waitingPeriod: string;
    prePostHosp: string;
    mandatoryDocs: string[];
    exclusions: string[];
  }
> = {
  A1: {
    category: "Standard Comprehensive Inpatient",
    coverageLimit: "₹5,00,000 to ₹15,00,000",
    roomRent: "1% of Sum Insured per day (Capped)",
    icuCap: "2% of Sum Insured per day",
    waitingPeriod: "30 days initial (Waived for Dengue & Accidents)",
    prePostHosp: "30 Days Pre / 60 Days Post-Hospitalization",
    mandatoryDocs: [
      "Clinical Summary / Admission Record",
      "Investigation / Pathology Lab Reports",
      "Inpatient Discharge Summary",
      "Itemized Tariff Sheet & Line-Item Estimate",
    ],
    exclusions: [
      "Cosmetic procedures & non-medical items",
      "Experimental unproven therapies",
      "Lump-sum non-itemized hospital bills",
    ],
  },
  A2: {
    category: "Surgical & Critical Illness Specialized",
    coverageLimit: "₹10,00,000 to ₹25,00,000",
    roomRent: "Single Private Room (No proportionate deduction)",
    icuCap: "Actuals up to Sum Insured",
    waitingPeriod: "24 months for specified pre-existing diseases",
    prePostHosp: "60 Days Pre / 90 Days Post-Hospitalization",
    mandatoryDocs: [
      "Operative Notes & Anesthesia Chart",
      "Pre-Op & Post-Op Diagnostic Scans",
      "Implant Stickers & Tax Invoices (if surgical)",
      "Discharge Summary & Itemized Final Bill",
    ],
    exclusions: [
      "Diagnostic-only admissions without active treatment",
      "Outpatient OPD consultations",
    ],
  },
  B1: {
    category: "Metro Super Speciality & KYC Mandatory",
    coverageLimit: "₹7,50,000 to ₹20,00,000",
    roomRent: "Shared / Twin Sharing Ward Base",
    icuCap: "Standard ICU Tariffs",
    waitingPeriod: "30 days initial waiting period",
    prePostHosp: "30 Days Pre / 60 Days Post-Hospitalization",
    mandatoryDocs: [
      "Government Photo Identity Proof (Aadhaar/PAN/Voter)",
      "Clinical Summary with Provisional Diagnosis",
      "Confirmed Pathology / Serology Report",
      "Discharge Summary & Pharmacy Invoices",
    ],
    exclusions: [
      "Admissions without verified patient photo ID copy",
      "Unregistered clinical establishments",
    ],
  },
  B2: {
    category: "Corporate Group Health Coverage",
    coverageLimit: "₹3,00,000 to ₹10,00,000",
    roomRent: "No Room Rent Sub-Limit Capping",
    icuCap: "No ICU Sub-Limit Capping",
    waitingPeriod: "Day-1 Coverage for All Pre-Existing Conditions",
    prePostHosp: "30 Days Pre / 60 Days Post-Hospitalization",
    mandatoryDocs: [
      "Corporate Employee ID & Health Card",
      "Treating Doctor Certificate",
      "Complete Diagnostic & Investigation Panel",
      "Final Itemized Hospital Bill",
    ],
    exclusions: [
      "External durable medical equipment (DME)",
      "Attendant charges & personal comfort items",
    ],
  },
};

export const PoliciesPage: React.FC<PoliciesPageProps> = ({
  appState,
  onNavigate,
}) => {
  const [selectedPolicyCode, setSelectedPolicyCode] = useState<string>("A1");

  const policyConfigs = appState.policy_configs || [];
  const selectedConfig =
    policyConfigs.find((p) => p.policy_code === selectedPolicyCode) ||
    policyConfigs[0];
  const selectedDetails =
    POLICY_DETAILS_MAP[selectedConfig?.policy_code || "A1"] || POLICY_DETAILS_MAP["A1"];

  return (
    <div className="max-w-[1360px] mx-auto p-6 md:p-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-widest">
            POLICY & PAYER REPOSITORY
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#0A0A0A] tracking-tight">
            Supported Insurer Policies ({policyConfigs.length})
          </h1>
          <p className="text-xs text-[#64748B]">
            Insurer schedules, document requirements, sub-limits, and waiting period guidelines evaluated by the engine.
          </p>
        </div>

        <div className="bg-[#F0F3FF] border border-[#0022FF]/30 text-[#0022FF] px-3 py-1.5 rounded-xs font-mono text-xs font-bold uppercase tracking-wider shrink-0">
          SYNTHETIC DEMO DATASET
        </div>
      </div>

      {/* Policy Selector Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {policyConfigs.map((pc) => {
          const isSelected = selectedPolicyCode === pc.policy_code;
          const details = POLICY_DETAILS_MAP[pc.policy_code] || POLICY_DETAILS_MAP["A1"];
          return (
            <div
              key={pc.policy_code}
              onClick={() => setSelectedPolicyCode(pc.policy_code)}
              className={`p-5 border-2 rounded-xs cursor-pointer transition-all ${
                isSelected
                  ? "border-[#0022FF] bg-[#F0F3FF] shadow-[4px_4px_0px_0px_#0022FF]"
                  : "border-[#D9D9D9] bg-white hover:border-[#0A0A0A]"
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className={isSelected ? "text-[#0022FF]" : "text-[#64748B]"}>
                  POLICY {pc.policy_code}
                </span>
                <span className="bg-[#0A0A0A] text-white text-[10px] px-1.5 py-0.5 rounded-xs">
                  ACTIVE
                </span>
              </div>
              <h3 className="font-heading font-bold text-lg text-[#0A0A0A] mt-2">
                {pc.policy_name}
              </h3>
              <p className="text-xs text-[#475569] mt-1">{pc.insurer}</p>
              <div className="text-[11px] font-mono text-[#64748B] pt-3 border-t border-[#D9D9D9] mt-3">
                {details.category}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Policy Detail Breakdown */}
      {selectedConfig && (
        <div className="bg-white border-2 border-[#0A0A0A] p-6 sm:p-8 rounded-xs shadow-[6px_6px_0px_0px_#0A0A0A] space-y-8 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D9D9D9]">
            <div>
              <div className="text-[11px] text-[#0022FF] font-bold uppercase tracking-wider">
                SELECTED POLICY SCHEDULE
              </div>
              <h2 className="font-heading font-extrabold text-2xl text-[#0A0A0A]">
                {selectedConfig.insurer} — Policy {selectedConfig.policy_code} ({selectedConfig.policy_name})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("new-claim")}
              className="px-4 py-2 bg-[#0A0A0A] hover:bg-[#0022FF] text-white text-xs font-bold rounded-xs cursor-pointer transition-colors"
            >
              Test Claim Under Policy {selectedConfig.policy_code} →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: Coverage & Limits */}
            <div className="space-y-3">
              <span className="font-bold text-[#0A0A0A] uppercase tracking-wider block text-[11px] border-b border-[#D9D9D9] pb-1">
                Coverage & Sub-Limits
              </span>
              <div>
                <span className="text-[#64748B] block">Category:</span>
                <strong className="text-[#0A0A0A]">{selectedDetails.category}</strong>
              </div>
              <div>
                <span className="text-[#64748B] block">Coverage Limit:</span>
                <strong className="text-[#0A0A0A]">{selectedDetails.coverageLimit}</strong>
              </div>
              <div>
                <span className="text-[#64748B] block">Room Rent Capping:</span>
                <strong className="text-[#0A0A0A]">{selectedDetails.roomRent}</strong>
              </div>
              <div>
                <span className="text-[#64748B] block">ICU Capping:</span>
                <strong className="text-[#0A0A0A]">{selectedDetails.icuCap}</strong>
              </div>
              <div>
                <span className="text-[#64748B] block">Pre / Post Hospitalization:</span>
                <strong className="text-[#0A0A0A]">{selectedDetails.prePostHosp}</strong>
              </div>
            </div>

            {/* Column 2: Mandatory Documents */}
            <div className="space-y-3">
              <span className="font-bold text-[#0A0A0A] uppercase tracking-wider block text-[11px] border-b border-[#D9D9D9] pb-1">
                Mandatory Documentation
              </span>
              <ul className="space-y-2">
                {selectedDetails.mandatoryDocs.map((doc, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[#0A0A0A]">
                    <span className="text-[#16834A] font-bold">✓</span>
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Exclusions & Conditions */}
            <div className="space-y-3">
              <span className="font-bold text-[#0A0A0A] uppercase tracking-wider block text-[11px] border-b border-[#D9D9D9] pb-1">
                Specific Policy Exclusions
              </span>
              <ul className="space-y-2">
                {selectedDetails.exclusions.map((exc, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[#D93636]">
                    <span className="font-bold">✗</span>
                    <span>{exc}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-2">
                <span className="text-[#64748B] block">Waiting Period:</span>
                <strong className="text-[#0A0A0A]">{selectedDetails.waitingPeriod}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
