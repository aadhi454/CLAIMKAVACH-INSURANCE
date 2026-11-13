import React, { useState } from "react";
import {
  Sliders,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  Check,
} from "lucide-react";
import { AppState, PageView, RuleItem } from "../types/claim";

interface RulesPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
  onSaveRule: (rule: Partial<RuleItem>) => Promise<void>;
  onToggleRuleState: (ruleId: string, newState: "APPROVED" | "DEACTIVATED") => Promise<void>;
}

export const RulesPage: React.FC<RulesPageProps> = ({
  appState,
  onNavigate,
  onSaveRule,
  onToggleRuleState,
}) => {
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);

  // New Rule Form State
  const [newRuleId, setNewRuleId] = useState("RULE-CUSTOM-01");
  const [newInsurer, setNewInsurer] = useState("Fictional Insurer A");
  const [newPolicyCode, setNewPolicyCode] = useState("A1");
  const [newClaimType, setNewClaimType] = useState("ALL");
  const [newDescription, setNewDescription] = useState(
    "Requires Discharge Summary and Itemized Estimate with verifiable tariff breakdown."
  );
  const [newRequiredDocs, setNewRequiredDocs] = useState("discharge_summary, itemized_estimate");
  const [newRequiredFields, setNewRequiredFields] = useState("patient_id, policy_id, total_estimated_amount");
  const [newApprovalState, setNewApprovalState] = useState<"APPROVED" | "DRAFT">("APPROVED");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rules = appState.rules || [];

  const filteredRules = rules.filter((r) => {
    const matchesSearch =
      r.rule_id.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.insurer.toLowerCase().includes(search.toLowerCase());

    const matchesState = filterState === "ALL" || r.approval_state === filterState;

    return matchesSearch && matchesState;
  });

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSaveRule({
        rule_id: newRuleId.trim(),
        insurer: newInsurer,
        policy_code: newPolicyCode,
        claim_type: newClaimType,
        description: newDescription.trim(),
        required_documents: newRequiredDocs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        required_fields: newRequiredFields
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        approval_state: newApprovalState,
      });
      setShowAddModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto p-6 md:p-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-widest">
            ENGINE GOVERNANCE & CUSTOMIZATION
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#0A0A0A] tracking-tight">
            Verification Rules Registry ({rules.length})
          </h1>
          <p className="text-xs text-[#64748B]">
            Only APPROVED rules within effective dates execute during claim validation. Versioned in SQLite.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-5 py-2.5 rounded-full bg-[#0022FF] hover:bg-[#0044FF] text-white text-xs font-mono font-bold tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          ADD / VERSION RULE
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 font-mono text-xs">
        <div className="sm:col-span-8 relative">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Rule ID, Insurer, or description..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:outline-none focus:border-[#0022FF]"
          />
        </div>

        <div className="sm:col-span-4">
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:outline-none focus:border-[#0022FF]"
          >
            <option value="ALL">All Rule States</option>
            <option value="APPROVED">APPROVED Only</option>
            <option value="DRAFT">DRAFT Only</option>
            <option value="DEACTIVATED">DEACTIVATED Only</option>
          </select>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white border-2 border-[#0A0A0A] rounded-xs shadow-[4px_4px_0px_0px_#0A0A0A] overflow-hidden">
        <table className="w-full text-left font-mono text-xs border-collapse">
          <thead>
            <tr className="bg-[#0A0A0A] text-white border-b-2 border-[#0A0A0A]">
              <th className="p-3.5 font-bold uppercase tracking-wider">Rule ID & Version</th>
              <th className="p-3.5 font-bold uppercase tracking-wider">Target Insurer & Policy</th>
              <th className="p-3.5 font-bold uppercase tracking-wider">Description</th>
              <th className="p-3.5 font-bold uppercase tracking-wider">Requirements</th>
              <th className="p-3.5 font-bold uppercase tracking-wider">Status</th>
              <th className="p-3.5 font-bold uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D9D9D9]">
            {filteredRules.map((r) => {
              const isApproved = r.approval_state === "APPROVED";
              return (
                <tr key={`${r.rule_id}-v${r.version}`} className="hover:bg-[#F5F5F5] transition-colors">
                  <td className="p-3.5 font-bold text-[#0A0A0A]">
                    {r.rule_id} <span className="text-[#64748B]">(v{r.version})</span>
                  </td>
                  <td className="p-3.5 text-[#475569]">
                    {r.insurer} · <strong>{r.policy_code}</strong>
                  </td>
                  <td className="p-3.5 text-[#0A0A0A] max-w-sm truncate">{r.description}</td>
                  <td className="p-3.5 text-[#64748B] text-[11px]">
                    Docs: {r.required_documents.join(", ") || "none"}
                    <br />
                    Fields: {r.required_fields.join(", ") || "none"}
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`font-bold px-2 py-0.5 rounded-xs text-[10px] uppercase ${
                        isApproved
                          ? "bg-[#F0FDF4] text-[#16834A] border border-[#BBF7D0]"
                          : r.approval_state === "DRAFT"
                          ? "bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A]"
                          : "bg-[#F5F5F5] text-[#64748B] border border-[#D9D9D9]"
                      }`}
                    >
                      [{r.approval_state}]
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    {isApproved ? (
                      <button
                        type="button"
                        onClick={() => onToggleRuleState(r.rule_id, "DEACTIVATED")}
                        className="px-2.5 py-1 text-[11px] font-bold text-[#D93636] border border-[#D9D9D9] hover:border-[#D93636] rounded-xs cursor-pointer"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onToggleRuleState(r.rule_id, "APPROVED")}
                        className="px-2.5 py-1 text-[11px] font-bold text-[#16834A] bg-[#F0FDF4] border border-[#BBF7D0] hover:bg-[#16834A] hover:text-white rounded-xs cursor-pointer transition-colors"
                      >
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Version Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-white border-2 border-[#0A0A0A] p-6 rounded-xs shadow-[8px_8px_0px_0px_#0A0A0A] space-y-6 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9D9D9]">
              <h2 className="font-heading font-extrabold text-xl text-[#0A0A0A]">
                Add / Version Payer Rule
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[#64748B] hover:text-[#0A0A0A] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#0A0A0A] uppercase">Rule Identifier</label>
                  <input
                    type="text"
                    value={newRuleId}
                    onChange={(e) => setNewRuleId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#D9D9D9] rounded-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#0A0A0A] uppercase">Policy Code</label>
                  <input
                    type="text"
                    value={newPolicyCode}
                    onChange={(e) => setNewPolicyCode(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#D9D9D9] rounded-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-[#0A0A0A] uppercase">Insurer Name</label>
                  <input
                    type="text"
                    value={newInsurer}
                    onChange={(e) => setNewInsurer(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#D9D9D9] rounded-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-[#0A0A0A] uppercase">Approval Lifecycle</label>
                  <select
                    value={newApprovalState}
                    onChange={(e) => setNewApprovalState(e.target.value as "APPROVED" | "DRAFT")}
                    className="w-full px-2.5 py-1.5 border border-[#D9D9D9] rounded-xs bg-white"
                  >
                    <option value="APPROVED">APPROVED (Active in checks)</option>
                    <option value="DRAFT">DRAFT (Testing only)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#0A0A0A] uppercase">Rule Description</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#D9D9D9] rounded-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#0A0A0A] uppercase">
                  Required Documents (Comma-separated)
                </label>
                <input
                  type="text"
                  value={newRequiredDocs}
                  onChange={(e) => setNewRequiredDocs(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#D9D9D9] rounded-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#0A0A0A] uppercase">
                  Required Fields (Comma-separated)
                </label>
                <input
                  type="text"
                  value={newRequiredFields}
                  onChange={(e) => setNewRequiredFields(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#D9D9D9] rounded-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-[#D9D9D9] text-[#64748B] hover:text-[#0A0A0A] rounded-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 bg-[#0022FF] hover:bg-[#0044FF] text-white font-bold rounded-xs cursor-pointer"
                >
                  {isSubmitting ? "Persisting..." : "Save Rule Version"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
