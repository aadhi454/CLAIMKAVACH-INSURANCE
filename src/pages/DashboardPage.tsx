import React from "react";
import { Activity, CheckCircle2, Clock3, FileWarning, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { AppState, PageView } from "../types/claim";

interface DashboardPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
  onSelectClaim: (claimId: string) => void;
  onLaunchDemoScenario: (preset: "perfect" | "conflict") => void;
}

const money = (value: string) => value ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value) || 0) : "Not captured";

export const DashboardPage: React.FC<DashboardPageProps> = ({ appState, onNavigate, onSelectClaim, onLaunchDemoScenario }) => {
  const { metrics, pipeline, priority_queue: priorityQueue, recent_activity: recentActivity, verification_volume: volume, data_note: dataNote } = appState.operations;
  const maxVolume = Math.max(1, ...volume.map((point) => point.total));
  const metricCards = [
    ["Claims received", metrics.total_claims, "All persisted claim records", ShieldCheck, "text-[#0F766E] bg-[#F0FDFA]"],
    ["Under verification", metrics.under_verification, "Queued or still being prepared", Clock3, "text-[#0369A1] bg-[#F0F9FF]"],
    ["Verification complete", metrics.completed_verifications, "FHIR draft gate open", CheckCircle2, "text-[#15803D] bg-[#F0FDF4]"],
    ["Needs attention", metrics.requires_review, "Evidence gap or human review", TriangleAlert, "text-[#B45309] bg-[#FFFBEB]"],
    ["Failed runs", metrics.failed_execution_runs, "Recorded execution failures", FileWarning, "text-[#B91C1C] bg-[#FEF2F2]"],
  ] as const;
  const stages = [
    ["Submitted", pipeline.submitted, "all-claims"], ["Queued", pipeline.queued, "all-claims"], ["Verified", pipeline.completed, "all-claims"], ["Human review", pipeline.review, "review-center"], ["Closed", pipeline.closed, "all-claims"],
  ] as const;

  return <div className="command-center max-w-[1440px] mx-auto p-6 md:p-8 space-y-7">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="badge-tag text-[#0F766E]">Command Center · Operations workspace</div><h1 className="font-heading text-3xl md:text-4xl font-extrabold text-[#102A43] mt-2">Clear the work that matters today.</h1><p className="text-sm text-[#627D98] mt-2 max-w-2xl">A live view of claim verification, exceptions, and the next action for your team.</p></div>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => onLaunchDemoScenario("perfect")} className="px-4 py-2.5 text-xs font-mono font-bold text-[#0F766E] border border-[#99F6E4] bg-white rounded-lg hover:bg-[#F0FDFA]">RUN DEMO PACKET</button><button type="button" onClick={() => onNavigate("new-claim")} className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-bold text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg"><Plus className="w-4 h-4" /> NEW CLAIM</button></div>
    </header>
    <p className="text-[11px] font-mono text-[#829AB1]">{dataNote}</p>
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {metricCards.map(([label, value, detail, Icon, tone]) => <div key={label} className="rounded-xl border border-[#D9E2EC] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#486581]">{label}</span><span className={`p-2 rounded-lg ${tone}`}><Icon className="w-4 h-4" /></span></div><div className="font-heading text-3xl font-extrabold text-[#102A43] mt-5">{value}</div><p className="text-[11px] text-[#829AB1] mt-1">{detail}</p></div>)}
    </section>
    <section className="rounded-xl border border-[#D9E2EC] bg-white p-5 md:p-6"><div className="flex items-center justify-between gap-4 mb-5"><div><div className="badge-tag text-[#0F766E]">Workflow health</div><h2 className="font-heading font-bold text-xl text-[#102A43] mt-1">Claims lifecycle</h2></div><button type="button" onClick={() => onNavigate("all-claims")} className="text-xs font-mono font-bold text-[#0F766E]">OPEN CLAIMS WORKSPACE →</button></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3">{stages.map(([label, count, view], index) => <button type="button" key={label} onClick={() => onNavigate(view)} className="text-left rounded-lg border border-[#E6EEF5] p-4 hover:border-[#2DD4BF] hover:bg-[#F0FDFA] transition-colors"><span className="font-mono text-[10px] text-[#829AB1]">0{index + 1}</span><div className="font-heading font-extrabold text-3xl text-[#102A43] mt-3">{count}</div><div className="text-[11px] font-semibold text-[#486581] mt-1">{label}</div></button>)}</div></section>
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <section className="xl:col-span-7 rounded-xl border border-[#D9E2EC] bg-white p-5 md:p-6"><div className="flex items-start justify-between"><div><div className="badge-tag text-[#B45309]">Priority attention queue</div><h2 className="font-heading font-bold text-xl text-[#102A43] mt-1">Resolve blockers before submission</h2></div><button type="button" onClick={() => onNavigate("review-center")} className="text-xs font-mono font-bold text-[#0F766E]">OPEN REVIEW CENTER →</button></div><div className="mt-5 divide-y divide-[#E6EEF5]">{priorityQueue.length === 0 ? <div className="py-10 text-center text-sm text-[#627D98]">No persisted verification blockers. New exceptions will appear here.</div> : priorityQueue.map((item) => <button key={item.claim_id} type="button" onClick={() => { onSelectClaim(item.claim_id); onNavigate("results"); }} className="w-full text-left py-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 hover:bg-[#F8FAFC]"><div><div className="flex gap-2 items-center"><span className="font-mono text-xs font-bold text-[#102A43]">{item.claim_id}</span><span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${item.severity === "HIGH" ? "bg-[#FEF2F2] text-[#B91C1C]" : "bg-[#FFFBEB] text-[#B45309]"}`}>{item.severity}</span></div><p className="text-sm text-[#334E68] mt-1">{item.reason}</p><p className="text-xs text-[#627D98] mt-1">Next: {item.next_action}</p></div><div className="md:text-right"><div className="text-xs font-semibold text-[#102A43]">{money(item.amount)}</div><div className="text-[11px] text-[#829AB1] mt-1">{item.status}</div></div></button>)}</div></section>
      <section className="xl:col-span-5 rounded-xl border border-[#D9E2EC] bg-white p-5 md:p-6"><div className="badge-tag text-[#0369A1]">Verification activity</div><h2 className="font-heading font-bold text-xl text-[#102A43] mt-1">Recent execution volume</h2>{volume.length ? <div className="mt-7 h-40 flex gap-3 items-end">{volume.map((point) => <div key={point.date} className="flex-1 min-w-6 flex flex-col items-center gap-2"><div className="w-full max-w-9 rounded-t bg-[#99F6E4]" style={{ height: `${Math.max(8, (point.total / maxVolume) * 110)}px` }} title={`${point.total} run(s), ${point.clear} clear, ${point.exception} exceptions`} /><span className="text-[9px] font-mono text-[#829AB1] whitespace-nowrap">{point.date.slice(5)}</span></div>)}</div> : <div className="h-40 grid place-items-center text-sm text-[#627D98]">Run a verification to begin collecting performance data.</div>}<div className="flex items-center justify-between border-t border-[#E6EEF5] mt-5 pt-4"><span className="text-xs text-[#627D98]">Average verification duration</span><span className="font-mono text-xs font-bold text-[#102A43]">{metrics.average_verification_seconds === null ? "No completed run" : `${metrics.average_verification_seconds}s`}</span></div></section>
    </div>
    <section className="rounded-xl border border-[#D9E2EC] bg-white p-5 md:p-6"><div className="flex items-center gap-2"><Activity className="w-4 h-4 text-[#0F766E]" /><h2 className="font-heading font-bold text-xl text-[#102A43]">Recent activity</h2></div><div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{recentActivity.length ? recentActivity.map((event) => <div key={event.audit_id} className="rounded-lg border border-[#E6EEF5] p-3"><div className="font-mono text-[10px] font-bold text-[#0F766E]">{event.action.replaceAll("_", " ")}</div><p className="text-xs text-[#486581] mt-2 line-clamp-2">{event.redacted_details}</p><div className="text-[10px] text-[#829AB1] mt-3">{event.claim_id || "System"} · {event.timestamp.slice(0, 19).replace("T", " ")}</div></div>) : <p className="text-sm text-[#627D98]">No activity has been recorded yet.</p>}</div></section>
  </div>;
};
