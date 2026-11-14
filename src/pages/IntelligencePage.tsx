import React from "react";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileSearch,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { AppState, PageView } from "../types/claim";

interface Props {
  appState: AppState;
  onNavigate: (view: PageView) => void;
}

export const IntelligencePage: React.FC<Props> = ({ appState, onNavigate }) => {
  const claim = appState.active_claim;
  if (!claim) {
    return (
      <div className="max-w-[1360px] mx-auto p-12 text-center">
        <h1 className="font-heading text-2xl font-bold text-[#102A43]">No claim is selected</h1>
        <p className="text-sm text-[#627D98] mt-2">Select a claim from the workspace to inspect its evidence intelligence.</p>
        <button type="button" onClick={() => onNavigate("all-claims")} className="mt-5 px-4 py-2 text-xs font-mono font-bold rounded-lg bg-[#0F766E] text-white">
          OPEN CLAIMS WORKSPACE
        </button>
      </div>
    );
  }

  const exceptionFindings = appState.findings.filter((finding) => finding.status !== "PASS");
  const factFindings = appState.findings.filter((finding) => finding.status === "PASS");
  const priority = appState.sla_priority;
  const integrity = appState.integrity_signals;
  const copilot = appState.policy_copilot;

  return (
    <div className="max-w-[1360px] mx-auto p-6 md:p-8 space-y-7">
      <header className="flex flex-col lg:flex-row lg:justify-between gap-4">
        <div>
          <div className="badge-tag text-[#0369A1]">Intelligence Center · Explainable evidence</div>
          <h1 className="font-heading text-3xl font-extrabold text-[#102A43] mt-2">{claim.claim_id} assessment</h1>
          <p className="text-sm text-[#627D98] mt-2">Classification, provenance, operational prioritization, and integrity signals from local persisted evidence.</p>
        </div>
        <div className="rounded-lg border border-[#D9E2EC] p-4 bg-white">
          <div className="text-[10px] font-mono text-[#829AB1]">ASSESSMENT</div>
          <div className="text-sm font-bold text-[#102A43] mt-1">{appState.risk_summary.band} operational risk · {appState.risk_summary.score}/100</div>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#D9E2EC] bg-white p-5">
          <FileSearch className="w-5 h-5 text-[#0369A1]" />
          <h2 className="font-heading font-bold text-lg text-[#102A43] mt-4">Documents</h2>
          <p className="text-sm text-[#486581] mt-2">{appState.documents.length} processed · {appState.document_completeness.missing_count} required item(s) missing.</p>
        </div>
        <div className="rounded-xl border border-[#D9E2EC] bg-white p-5">
          <ScanLine className="w-5 h-5 text-[#7C3AED]" />
          <h2 className="font-heading font-bold text-lg text-[#102A43] mt-4">Scan quality</h2>
          <p className="text-sm text-[#486581] mt-2">{appState.scan_quality.average_score === null ? "Not scored" : `${appState.scan_quality.average_score}/100 average`} · ingest quality only.</p>
        </div>
        <div className="rounded-xl border border-[#D9E2EC] bg-white p-5">
          <ShieldCheck className="w-5 h-5 text-[#0F766E]" />
          <h2 className="font-heading font-bold text-lg text-[#102A43] mt-4">Policy checks</h2>
          <p className="text-sm text-[#486581] mt-2">{appState.applicable_rules?.length || 0} approved local rule(s) evaluated.</p>
        </div>
        <div className="rounded-xl border border-[#D9E2EC] bg-white p-5">
          <Clock3 className="w-5 h-5 text-[#B45309]" />
          <h2 className="font-heading font-bold text-lg text-[#102A43] mt-4">SLA priority</h2>
          <p className="text-sm text-[#486581] mt-2">{priority ? `${priority.priority} · ${priority.deadline_hours}h workflow target` : "Not available"}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#D9E2EC] bg-white overflow-hidden">
          <div className="p-5 border-b border-[#D9E2EC]">
            <h2 className="font-heading font-bold text-xl text-[#102A43]">Classification & scan-quality details</h2>
          </div>
          <div className="divide-y divide-[#E6EEF5]">
            {appState.scan_quality.items.map((item) => (
              <div key={item.doc_id} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm text-[#102A43]">{item.filename}</div>
                    <div className="text-[11px] font-mono text-[#627D98] mt-1">{item.document_type} · {item.processing_mode}</div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-1 rounded-full ${item.band === "GOOD" ? "bg-[#ECFDF3] text-[#15803D]" : item.band === "REVIEW" ? "bg-[#FFFBEB] text-[#B45309]" : "bg-[#FEF2F2] text-[#B91C1C]"}`}>
                    {item.band} · {item.score}
                  </span>
                </div>
                {item.reasons.length > 0 && <p className="text-xs text-[#486581] mt-3">{item.reasons.join(" ")}</p>}
              </div>
            ))}
            {appState.scan_quality.items.length === 0 && <div className="p-8 text-sm text-[#627D98]">No documents have been processed.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-[#FDE68A] bg-white overflow-hidden">
          <div className="p-5 border-b border-[#FDE68A]">
            <div className="flex items-center gap-2"><CircleAlert className="w-4 h-4 text-[#B45309]" /><h2 className="font-heading font-bold text-xl text-[#102A43]">Missing evidence recommender</h2></div>
          </div>
          <div className="divide-y divide-[#FEF3C7]">
            {appState.missing_document_recommendations.length > 0 ? appState.missing_document_recommendations.map((item) => (
              <div key={item.document_type} className="p-5">
                <div className="flex items-center gap-2"><span className="text-[10px] font-mono font-bold px-2 py-1 rounded-full bg-[#FEF2F2] text-[#B91C1C]">{item.priority}</span><span className="font-semibold text-sm text-[#102A43]">{item.label}</span></div>
                <p className="text-xs text-[#486581] mt-2">{item.reason}</p>
                <p className="text-xs text-[#0F766E] mt-2">{item.action}</p>
              </div>
            )) : <div className="p-8 text-sm text-[#627D98]">No missing document type is indicated by the applicable rules.</div>}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#D9E2EC] bg-white overflow-hidden">
          <div className="p-5 border-b border-[#D9E2EC]"><h2 className="font-heading font-bold text-xl text-[#102A43]">Denial-risk & SLA prioritization</h2></div>
          {priority && <div className="p-5 space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#102A43]">Priority</span><span className="font-mono text-xs font-bold text-[#B45309]">{priority.priority}</span></div>
            <p className="text-sm text-[#486581]">{priority.reason}</p>
            <p className="text-xs text-[#829AB1]">Tracking from {priority.timer_basis}: {priority.tracked_from}. Target window: {priority.deadline_hours} hour(s).</p>
            <p className="text-[11px] text-[#829AB1]">{priority.disclaimer}</p>
          </div>}
        </div>
        <div className="rounded-xl border border-[#D9E2EC] bg-white overflow-hidden">
          <div className="p-5 border-b border-[#D9E2EC]"><div className="flex items-center gap-2"><TriangleAlert className="w-4 h-4 text-[#B45309]" /><h2 className="font-heading font-bold text-xl text-[#102A43]">Fraud / duplicate review signals</h2></div></div>
          <div className="p-5">
            <p className="text-xs text-[#829AB1] mb-3">{integrity.disclaimer}</p>
            {integrity.signals.length ? integrity.signals.map((signal, index) => <div key={`${signal.type}-${index}`} className="border-l-2 border-[#F59E0B] pl-3 mb-4"><div className="text-[10px] font-mono font-bold text-[#B45309]">{signal.severity} · {signal.type}</div><p className="text-sm text-[#102A43] mt-1">{signal.message}</p><p className="text-xs text-[#0F766E] mt-1">{signal.disposition}</p></div>) : <div className="text-sm text-[#627D98]">No duplicate or cross-document conflict signal is present.</div>}
          </div>
        </div>
      </section>

      {copilot && <section className="rounded-xl border border-[#DDD6FE] bg-white overflow-hidden">
        <div className="p-5 border-b border-[#EDE9FE] flex items-center gap-2"><Bot className="w-4 h-4 text-[#7C3AED]" /><h2 className="font-heading font-bold text-xl text-[#102A43]">Policy RAG copilot</h2></div>
        <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
          <div><div className="text-[10px] font-mono text-[#7C3AED]">QUESTION</div><p className="text-sm font-semibold text-[#102A43] mt-2">{copilot.question}</p><p className="text-sm text-[#486581] mt-3">{copilot.answer}</p><p className="text-[11px] text-[#829AB1] mt-4">{copilot.scope}. {copilot.disclaimer}</p></div>
          <div><div className="text-[10px] font-mono text-[#7C3AED]">CITED RULES</div><div className="mt-2 space-y-2">{copilot.citations.map((citation) => <div key={`${citation.rule_id}-${citation.source_reference}`} className="rounded-lg bg-[#F5F3FF] p-3"><div className="font-mono text-xs font-bold text-[#5B21B6]">{citation.rule_id}</div><p className="text-xs text-[#486581] mt-1">{citation.description}</p><p className="text-[10px] text-[#829AB1] mt-1">{citation.source_reference}</p></div>)}</div></div>
        </div>
      </section>}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#FDE68A] bg-white overflow-hidden"><div className="p-5 border-b border-[#FDE68A]"><div className="flex items-center gap-2"><CircleAlert className="w-4 h-4 text-[#B45309]" /><h2 className="font-heading font-bold text-xl text-[#102A43]">Items requiring investigation</h2></div></div><div className="divide-y divide-[#FEF3C7]">{exceptionFindings.length ? exceptionFindings.map((finding) => <div key={finding.finding_id} className="p-5"><div className="flex items-center gap-2"><span className={`text-[10px] font-mono font-bold px-2 py-1 rounded-full ${finding.status === "FAIL" ? "bg-[#FEF2F2] text-[#B91C1C]" : "bg-[#FFFBEB] text-[#B45309]"}`}>{finding.status}</span><span className="font-mono text-[10px] text-[#627D98]">{finding.rule_id}</span></div><h3 className="font-semibold text-sm text-[#102A43] mt-3">{finding.issue || finding.reason}</h3><p className="text-xs text-[#486581] mt-2">{finding.reason}</p><p className="text-xs text-[#0F766E] mt-3">Next: {finding.recommended_action || "Open the supporting evidence."}</p></div>) : <div className="p-8 text-sm text-[#627D98]">No exceptions are recorded.</div>}</div></div>
        <div className="rounded-xl border border-[#D9E2EC] bg-white overflow-hidden"><div className="p-5 border-b border-[#D9E2EC]"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#15803D]" /><h2 className="font-heading font-bold text-xl text-[#102A43]">Verified facts</h2></div></div><div className="divide-y divide-[#E6EEF5]">{factFindings.slice(0, 8).map((finding) => <div key={finding.finding_id} className="p-5"><div className="font-mono text-[10px] text-[#0F766E]">DETERMINISTIC CHECK · {finding.rule_id}</div><h3 className="font-semibold text-sm text-[#102A43] mt-2">{finding.issue || "Evidence verified"}</h3><p className="text-xs text-[#486581] mt-2">{finding.reason}</p>{finding.evidence_references?.[0] && <p className="text-[11px] font-mono text-[#829AB1] mt-3">{finding.evidence_references[0].source_document} · p.{finding.evidence_references[0].page}</p>}</div>)}</div></div>
      </section>
    </div>
  );
};
