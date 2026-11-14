import React, { useEffect, useState } from "react";
import { CheckCircle2, Download, LogOut, Plus, RefreshCw, ShieldCheck, X, XCircle } from "lucide-react";
import { PageView } from "../types/claim";

interface InsurerIdentity {
  id: string;
  company_name: string;
  insurer_code: string;
  email: string;
}

interface DispatchedClaim {
  id: string;
  claim_ref: string;
  hospital_name: string;
  policy_name: string;
  diagnosis: string;
  masked_patient_summary: string;
  rule_audit: Array<{ rule_id?: string; status?: string; reason?: string; issue?: string }>;
  fhir_bundle: Record<string, unknown>;
  payer_status: "RECEIVED" | "APPROVED" | "QUERY_RAISED";
  dispatched_at: string;
}

interface Props {
  insurer: InsurerIdentity;
  onNavigate: (view: PageView) => void;
  onLogout: () => void;
}

export const InsurerPortalPage: React.FC<Props> = ({ insurer, onNavigate, onLogout }) => {
  const [claims, setClaims] = useState<DispatchedClaim[]>([]);
  const [policyName, setPolicyName] = useState("");
  const [condition, setCondition] = useState("");
  const [claimType, setClaimType] = useState<"Cashless Pre-Auth" | "Final Discharge">("Cashless Pre-Auth");
  const [documentInput, setDocumentInput] = useState("");
  const [documents, setDocuments] = useState<string[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<DispatchedClaim | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  const loadClaims = async () => {
    try {
      const response = await fetch(`/api/insurers/${encodeURIComponent(insurer.id)}/claims`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Unable to load claims inbox.");
      setClaims(payload as DispatchedClaim[]);
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void loadClaims();
    const timer = window.setInterval(() => void loadClaims(), 10000);
    return () => window.clearInterval(timer);
  }, [insurer.id]);

  const addDocument = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = documentInput.trim();
    if (value && !documents.includes(value)) setDocuments((current) => [...current, value]);
    setDocumentInput("");
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!documents.length) {
      setNotice("Add at least one required document.");
      return;
    }
    setSavingRule(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/insurers/${encodeURIComponent(insurer.id)}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_name: policyName, condition, claim_type: claimType, required_documents: documents }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Unable to save policy rule.");
      setPolicyName("");
      setCondition("");
      setDocuments([]);
      setNotice(`Rule ${payload.rule_id} is active for hospital audits.`);
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingRule(false);
    }
  };

  const updateStatus = async (status: "APPROVED" | "QUERY_RAISED") => {
    if (!selectedClaim) return;
    try {
      const response = await fetch(`/api/claims/${encodeURIComponent(selectedClaim.id)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payer_status: status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Unable to update payer status.");
      setSelectedClaim(payload);
      setClaims((current) => current.map((claim) => claim.id === payload.id ? payload : claim));
      setNotice(`Claim ${payload.claim_ref} marked ${status}.`);
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const downloadBundle = () => {
    if (!selectedClaim) return;
    const blob = new Blob([JSON.stringify(selectedClaim.fhir_bundle, null, 2)], { type: "application/fhir+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedClaim.claim_ref}-ClaimBundle.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full bg-[linear-gradient(135deg,#EEF5FC_0%,#DCE8F6_100%)] p-6 md:p-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-col gap-4 rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><div className="rounded-lg bg-[#0B192C] p-3 text-white"><ShieldCheck className="h-6 w-6 text-[#60A5FA]" /></div><div><div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0052FF]">INSURANCE COMPANY PORTAL</div><h1 className="font-heading text-2xl font-extrabold text-[#0B192C]">{insurer.company_name}</h1><p className="text-xs font-mono text-[#64748B]">{insurer.insurer_code} · {insurer.email}</p></div></div>
          <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-lg border border-[#CBD5E1] px-4 py-2 text-xs font-mono font-bold text-[#334E68]"><LogOut className="h-4 w-4" /> LOGOUT</button>
        </header>
        {notice && <div className="rounded-lg border border-[#BFDBFE] bg-white p-4 text-sm text-[#1D4ED8]">{notice}</div>}
        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <form onSubmit={saveRule} className="rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-sm">
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0052FF]">VIEW 1 · POLICY CONFIGURATION</div><h2 className="mt-2 font-heading text-xl font-bold text-[#0B192C]">Configure mandatory rules</h2><p className="mt-2 text-sm text-[#64748B]">Approved rules immediately drive the deterministic hospital audit engine.</p>
            <div className="mt-5 space-y-4"><label className="block text-xs font-mono font-bold text-[#475569]">POLICY NAME<input required value={policyName} onChange={(event) => setPolicyName(event.target.value)} className="mt-2 w-full rounded-lg border border-[#CBD5E1] px-3 py-2.5 text-sm font-sans" placeholder="Star Dengue Shield" /></label><label className="block text-xs font-mono font-bold text-[#475569]">CONDITION / DIAGNOSIS<input required value={condition} onChange={(event) => setCondition(event.target.value)} className="mt-2 w-full rounded-lg border border-[#CBD5E1] px-3 py-2.5 text-sm font-sans" placeholder="Dengue or Cataract" /></label><label className="block text-xs font-mono font-bold text-[#475569]">CLAIM TYPE<select value={claimType} onChange={(event) => setClaimType(event.target.value as typeof claimType)} className="mt-2 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm font-sans"><option>Cashless Pre-Auth</option><option>Final Discharge</option></select></label><label className="block text-xs font-mono font-bold text-[#475569]">REQUIRED DOCUMENTS<div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-[#CBD5E1] p-2">{documents.map((document) => <span key={document} className="inline-flex items-center gap-1 rounded-full bg-[#EEF5FC] px-2 py-1 text-[11px] text-[#0052FF]">{document}<button type="button" onClick={() => setDocuments((current) => current.filter((item) => item !== document))}><X className="h-3 w-3" /></button></span>)}<input value={documentInput} onChange={(event) => setDocumentInput(event.target.value)} onKeyDown={addDocument} className="min-w-[160px] flex-1 border-0 px-1 py-1 text-sm outline-none" placeholder="Type a document and press Enter" /></div></label></div>
            <button type="submit" disabled={savingRule} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0052FF] px-4 py-3 text-xs font-mono font-bold text-white disabled:opacity-60"><Plus className="h-4 w-4" /> {savingRule ? "SAVING..." : "SAVE ACTIVE RULE"}</button>
          </form>
          <section className="overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-sm"><div className="flex items-center justify-between border-b border-[#CBD5E1] p-6"><div><div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0052FF]">VIEW 2 · INCOMING CLAIMS INBOX</div><h2 className="mt-2 font-heading text-xl font-bold text-[#0B192C]">Hospital claims</h2></div><button type="button" onClick={() => void loadClaims()} className="rounded border border-[#CBD5E1] p-2 text-[#475569]"><RefreshCw className="h-4 w-4" /></button></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-[#EEF5FC] font-mono text-[#475569]"><tr><th className="p-4">Claim Ref</th><th className="p-4">Hospital</th><th className="p-4">Policy</th><th className="p-4">Diagnosis</th><th className="p-4">Verification</th><th className="p-4">Status</th><th className="p-4">Timestamp</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{claims.map((claim) => <tr key={claim.id} onClick={() => setSelectedClaim(claim)} className="cursor-pointer hover:bg-[#F8FAFC]"><td className="p-4 font-mono font-bold text-[#0B192C]">{claim.claim_ref}</td><td className="p-4 text-[#475569]">{claim.hospital_name}</td><td className="p-4 text-[#475569]">{claim.policy_name}</td><td className="p-4 text-[#475569]">{claim.diagnosis}</td><td className="p-4"><span className="rounded-full bg-[#DCFCE7] px-2 py-1 text-[10px] font-mono font-bold text-[#15803D]">100% DETERMINISTIC PASS</span></td><td className="p-4"><span className="font-mono text-[10px] font-bold text-[#0052FF]">{claim.payer_status}</span></td><td className="p-4 text-[#64748B]">{claim.dispatched_at}</td></tr>)}</tbody></table>{!claims.length && <div className="p-16 text-center text-sm text-[#64748B]">No validated claims have been transmitted to this inbox.</div>}</div></section>
        </section>
        {selectedClaim && <div className="fixed inset-0 z-50 flex justify-end bg-[#0B192C]/40" onClick={() => setSelectedClaim(null)}><aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0052FF]">CLAIM DETAIL</div><h2 className="mt-2 font-heading text-2xl font-bold text-[#0B192C]">{selectedClaim.claim_ref}</h2></div><button type="button" onClick={() => setSelectedClaim(null)} className="rounded border border-[#CBD5E1] p-2"><X className="h-4 w-4" /></button></div><div className="mt-6 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-4"><div className="text-xs font-mono font-bold text-[#475569]">LOCALLY MASKED PATIENT SUMMARY</div><p className="mt-2 text-sm text-[#0B192C]">{selectedClaim.masked_patient_summary}</p></div><h3 className="mt-6 font-heading font-bold text-[#0B192C]">Deterministic rule breakdown</h3><div className="mt-3 space-y-2">{selectedClaim.rule_audit.map((rule, index) => <div key={`${rule.rule_id || "rule"}-${index}`} className="flex items-start gap-2 rounded border border-[#E2E8F0] p-3 text-xs"><CheckCircle2 className="h-4 w-4 shrink-0 text-[#15803D]" /><div><strong className="font-mono text-[#0B192C]">{rule.rule_id || "RULE"}</strong><p className="mt-1 text-[#64748B]">{rule.reason || rule.issue || "PASS"}</p></div></div>)}</div><div className="mt-6 flex items-center justify-between"><h3 className="font-heading font-bold text-[#0B192C]">NHCX FHIR R4 ClaimBundle</h3><button type="button" onClick={downloadBundle} className="inline-flex items-center gap-1 rounded border border-[#CBD5E1] px-3 py-2 text-[10px] font-mono font-bold text-[#0052FF]"><Download className="h-3.5 w-3.5" /> DOWNLOAD JSON</button></div><pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-[#0B192C] p-4 text-[11px] leading-5 text-[#BFDBFE]">{JSON.stringify(selectedClaim.fhir_bundle, null, 2)}</pre><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => void updateStatus("APPROVED")} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#15803D] px-4 py-3 text-xs font-mono font-bold text-white"><CheckCircle2 className="h-4 w-4" /> APPROVE CASHLESS CLAIM</button><button type="button" onClick={() => void updateStatus("QUERY_RAISED")} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#DC2626] px-4 py-3 text-xs font-mono font-bold text-white"><XCircle className="h-4 w-4" /> RAISE QUERY</button></div></aside></div>}
      </div>
    </div>
  );
};
