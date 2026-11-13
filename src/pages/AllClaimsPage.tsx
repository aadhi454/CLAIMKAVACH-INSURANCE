import React, { useState } from "react";
import {
  Search,
  Filter,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { AppState, PageView } from "../types/claim";

interface AllClaimsPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
  onSelectClaim: (claimId: string) => void;
}

export const AllClaimsPage: React.FC<AllClaimsPageProps> = ({
  appState,
  onNavigate,
  onSelectClaim,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInsurer, setSelectedInsurer] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  const claims = appState.claims || [];

  const filteredClaims = claims.filter((c) => {
    const matchesSearch =
      c.claim_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.diagnosis && c.diagnosis.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.patient_name && c.patient_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesInsurer =
      selectedInsurer === "ALL" || c.insurer.toLowerCase().includes(selectedInsurer.toLowerCase());

    const isReady = c.status === "READY_FOR_FHIR" || c.status === "VERIFIED";
    const matchesStatus =
      selectedStatus === "ALL" ||
      (selectedStatus === "READY" && isReady) ||
      (selectedStatus === "REVIEW" && !isReady);

    return matchesSearch && matchesInsurer && matchesStatus;
  });

  return (
    <div className="max-w-[1360px] mx-auto p-6 md:p-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-widest">
            REGISTRY & AUDIT ARCHIVE
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#0A0A0A] tracking-tight">
            All Hospital Claims ({claims.length})
          </h1>
          <p className="text-xs text-[#64748B]">
            Search, filter, and inspect readiness audit records across all evaluated patient claims.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("new-claim")}
          className="px-5 py-2.5 rounded-full bg-[#0022FF] hover:bg-[#0044FF] text-white text-xs font-mono font-bold tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          NEW CLAIM WORKFLOW
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 font-mono text-xs">
        <div className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Claim ID, Diagnosis, or Patient..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:outline-none focus:border-[#0022FF]"
          />
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedInsurer}
            onChange={(e) => setSelectedInsurer(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:outline-none focus:border-[#0022FF]"
          >
            <option value="ALL">All Insurers</option>
            <option value="Insurer A">Insurer A (Comprehensive)</option>
            <option value="Insurer B">Insurer B (Standard)</option>
          </select>
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:outline-none focus:border-[#0022FF]"
          >
            <option value="ALL">All Readiness States</option>
            <option value="READY">100% Ready for FHIR</option>
            <option value="REVIEW">Needs Review / Action</option>
          </select>
        </div>
      </div>

      {/* Structured Neo-Brutalist Table */}
      <div className="bg-white border-2 border-[#0A0A0A] rounded-xs shadow-[4px_4px_0px_0px_#0A0A0A] overflow-hidden">
        <table className="w-full text-left font-mono text-xs border-collapse">
          <thead>
            <tr className="bg-[#0A0A0A] text-white border-b-2 border-[#0A0A0A]">
              <th className="p-3.5 font-bold uppercase tracking-wider">Claim Reference</th>
              <th className="p-3.5 font-bold uppercase tracking-wider">Payer & Policy</th>
              <th className="p-3.5 font-bold uppercase tracking-wider">Primary Diagnosis</th>
              <th className="p-3.5 font-bold uppercase tracking-wider">Admission Date</th>
              <th className="p-3.5 font-bold uppercase tracking-wider">Readiness Status</th>
              <th className="p-3.5 font-bold uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9D9D9]">
            {filteredClaims.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center text-[#64748B]">
                  No matching claims found. Try adjusting your search query or filters.
                </td>
              </tr>
            ) : (
              filteredClaims.map((claim) => {
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
                      {claim.insurer} · <strong>{claim.policy_code}</strong>
                    </td>
                    <td className="p-3.5 text-[#0A0A0A] font-semibold truncate max-w-[200px]">
                      {claim.diagnosis || "Auto-detecting"}
                    </td>
                    <td className="p-3.5 text-[#64748B]">{claim.relevant_date}</td>
                    <td className="p-3.5">
                      {isReady ? (
                        <span className="inline-flex items-center gap-1.5 text-[#16834A] font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> READY FOR GATEWAY
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#E6A000] font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" /> ACTION NEEDED
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <span className="text-[#0022FF] group-hover:translate-x-1 inline-block transition-transform font-bold">
                        Inspect Results →
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
  );
};
