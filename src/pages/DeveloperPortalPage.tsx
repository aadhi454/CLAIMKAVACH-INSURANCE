import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { AppState, PageView } from "../types/claim";

interface ApiKeyRecord {
  id: string;
  hospital_name: string;
  hms_provider: string;
  hms_system?: string;
  masked_prefix: string;
  environment: "sandbox" | "production";
  requests_count: number;
  last_used_at: string | null;
  status: "active" | "revoked";
  created_at: string;
}

interface DemoKey extends ApiKeyRecord {
  api_key: string;
}

type Scenario = "dengue" | "cataract";

interface Props {
  appState: AppState;
  onNavigate: (view: PageView) => void;
}

const scenarioConfig: Record<Scenario, { label: string; files: string[]; payload: Record<string, string> }> = {
  dengue: {
    label: "Dengue Trap - Missing NS1",
    files: ["01_clinical_summary.pdf", "05b_pending_serology_slip.pdf", "03_discharge_summary.pdf", "04_itemized_estimate.pdf"],
    payload: {
      hospital_claim_ref: "PORTAL-DENGUE-TRAP",
      insurer_id: "INS-DEMO-01",
      policy_type: "A1",
      claim_type: "Cashless Pre-Auth",
      diagnosis_icd10: "A90",
      relevant_date: "2026-10-10",
    },
  },
  cataract: {
    label: "Verified Cataract Claim",
    files: ["cataract_01_consultation_note.pdf", "cataract_02_biometry_report.pdf", "cataract_03_iol_barcode_invoice.pdf"],
    payload: {
      hospital_claim_ref: "PORTAL-CATARACT-VERIFIED",
      insurer_id: "INS-DEMO-02",
      policy_type: "B1",
      claim_type: "Cashless Pre-Auth",
      diagnosis_icd10: "H25.9",
      relevant_date: "2026-10-20",
    },
  },
};

const toBase64 = (bytes: ArrayBuffer): string => {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let index = 0; index < view.length; index += 1) binary += String.fromCharCode(view[index]);
  return btoa(binary);
};

export const DeveloperPortalPage: React.FC<Props> = ({ onNavigate }) => {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [demoKey, setDemoKey] = useState<DemoKey | null>(null);
  const [hospitalName, setHospitalName] = useState("");
  const [hmsProvider, setHmsProvider] = useState("Custom Hospital ERP");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [activeApiKey, setActiveApiKey] = useState<string | null>(null);
  const [showDemoKey, setShowDemoKey] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("dengue");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [keysResponse, demoResponse] = await Promise.all([
        fetch("/api/v1/keys"),
        fetch("/api/v1/keys/demo"),
      ]);
      const keysPayload = await keysResponse.json();
      const demoPayload = await demoResponse.json();
      if (!keysResponse.ok) throw new Error(keysPayload.message || "Unable to load API keys.");
      if (!demoResponse.ok) throw new Error(demoPayload.message || "Unable to load the demo API key.");
      setKeys(keysPayload as ApiKeyRecord[]);
      setDemoKey(demoPayload as DemoKey);
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const generateKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setNewKey(null);
    try {
      const response = await fetch("/api/v1/keys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital_name: hospitalName, hms_provider: hmsProvider, environment }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Unable to generate API key.");
      setNewKey(payload.api_key);
      setActiveApiKey(payload.api_key);
      setHospitalName("");
      await loadData();
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const revokeKey = async (id: string) => {
    setNotice(null);
    try {
      const response = await fetch(`/api/v1/keys/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Unable to revoke API key.");
      await loadData();
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const copyText = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value);
    setNotice(message);
  };

  const selectedKey = activeApiKey || demoKey?.api_key || "";
  const snippets = useMemo(() => ({
    curl: `curl -X POST http://localhost:3000/api/v1/audit-claim \\\n  -H "X-API-Key: ${selectedKey || "ck_test_..."}" \\\n  -H "Content-Type: application/json"`,
    python: `import requests\nrequests.post(\n  "http://localhost:3000/api/v1/audit-claim",\n  headers={"X-API-Key": "${selectedKey || "ck_test_..."}"},\n  json=payload,\n)`,
    node: `await fetch("http://localhost:3000/api/v1/audit-claim", {\n  method: "POST",\n  headers: {"X-API-Key": "${selectedKey || "ck_test_..."}"},\n  body: JSON.stringify(payload),\n});`,
  }), [selectedKey]);

  const runLiveTest = async () => {
    if (!selectedKey) {
      setNotice("Generate or load an API key before running the live test.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setNotice(null);
    const started = performance.now();
    try {
      const config = scenarioConfig[scenario];
      const documents = await Promise.all(config.files.map(async (filename) => {
        const response = await fetch(`/api/sample-pdf/${encodeURIComponent(filename)}`);
        if (!response.ok) throw new Error(`Unable to load ${filename} for the live test.`);
        return { filename, base64: toBase64(await response.arrayBuffer()) };
      }));
      const response = await fetch("/api/v1/audit-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": selectedKey },
        body: JSON.stringify({ ...config.payload, documents }),
      });
      const body = await response.json();
      setTestResult({ http_status: response.status, response_time_ms: Math.round(performance.now() - started), response: body });
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-full bg-[linear-gradient(135deg,#EEF5FC_0%,#DCE8F6_100%)] p-6 md:p-8">
      <div className="mx-auto max-w-[1360px] space-y-6">
        <header className="flex flex-col gap-4 border-b border-[#CBD5E1] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="text-xs font-mono font-bold uppercase tracking-widest text-[#0052FF]">B2B HOSPITAL INTEGRATION</div><h1 className="mt-2 font-heading text-3xl font-extrabold text-[#0B192C]">API Keys & Integration</h1><p className="mt-2 text-sm text-[#475569]">Generate credentials, inspect usage, and execute authenticated calls against the live deterministic firewall.</p></div>
          <button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-mono font-bold text-[#334E68]"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> REFRESH</button>
        </header>
        {notice && <div className="rounded-lg border border-[#FECACA] bg-white p-4 text-sm text-[#991B1B]">{notice}</div>}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#0052FF]" /><h2 className="font-heading text-xl font-bold text-[#0B192C]">Active default sandbox key</h2></div>
            <p className="mt-2 text-sm text-[#475569]">Use this seeded sandbox credential for demonstrations. It is a real authenticated key, not a frontend mock.</p>
            {demoKey && <div className="mt-5 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold text-[#15803D]">{demoKey.hospital_name}</div><div className="mt-1 text-[11px] text-[#475569]">{demoKey.hms_system || demoKey.hms_provider} · SANDBOX · {demoKey.status.toUpperCase()}</div></div><ShieldCheck className="h-5 w-5 text-[#15803D]" /></div><div className="mt-4 flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded bg-white p-2 text-xs text-[#14532D]">{showDemoKey ? demoKey.api_key : "ck_test_••••••••••••••••"}</code><button type="button" onClick={() => setShowDemoKey((value) => !value)} className="rounded border border-[#86EFAC] p-2 text-[#166534]" aria-label="Show or hide demo API key">{showDemoKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button><button type="button" onClick={() => void copyText(demoKey.api_key, "Demo API key copied.")} className="rounded border border-[#86EFAC] p-2 text-[#166534]" aria-label="Copy demo API key"><Copy className="h-4 w-4" /></button></div></div>}
          </div>

          <form onSubmit={generateKey} className="rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#0052FF]" /><h2 className="font-heading text-xl font-bold text-[#0B192C]">Generate new hospital API key</h2></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-mono font-bold text-[#475569] sm:col-span-2">HOSPITAL / CLINIC NAME<input required value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} className="mt-2 w-full rounded-lg border border-[#CBD5E1] px-3 py-2.5 text-sm font-sans" placeholder="Manipal Hospitals - Whitefield" /></label><label className="text-xs font-mono font-bold text-[#475569]">HMIS PLATFORM<select value={hmsProvider} onChange={(event) => setHmsProvider(event.target.value)} className="mt-2 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm font-sans"><option>InstaHMS</option><option>Practo Ray</option><option>SAP Healthcare</option><option>Custom Hospital ERP</option></select></label><label className="text-xs font-mono font-bold text-[#475569]">ENVIRONMENT<select value={environment} onChange={(event) => setEnvironment(event.target.value as "sandbox" | "production")} className="mt-2 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm font-sans"><option value="production">Production (ck_live_)</option><option value="sandbox">Sandbox (ck_test_)</option></select></label></div>
            <button type="submit" className="mt-5 w-full rounded-lg bg-[#0052FF] px-4 py-3 text-xs font-mono font-bold text-white hover:bg-[#0044D6]">CREATE API KEY</button>
            {newKey && <div className="mt-4 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-4"><div className="text-xs font-mono font-bold text-[#166534]">SECRET REVEALED ONCE</div><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 break-all rounded bg-white p-2 text-xs text-[#14532D]">{newKey}</code><button type="button" onClick={() => void copyText(newKey, "New API key copied.")} className="rounded border border-[#86EFAC] p-2 text-[#166534]" aria-label="Copy new API key"><Copy className="h-4 w-4" /></button></div><p className="mt-2 text-[11px] text-[#166534]">Only the SHA-256 hash is retained by the backend. Store this secret securely.</p></div>}
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#CBD5E1] p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#15803D]" /><h2 className="font-heading text-xl font-bold text-[#0B192C]">Issued hospital keys</h2></div><span className="text-xs font-mono text-[#64748B]">{keys.length} credential(s)</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#EEF5FC] font-mono text-[#475569]"><tr><th className="p-4">Hospital Name</th><th className="p-4">HMIS</th><th className="p-4">API Key Prefix</th><th className="p-4">Environment</th><th className="p-4">Claims Audited</th><th className="p-4">Last Used</th><th className="p-4">Status</th><th className="p-4">Action</th></tr></thead><tbody className="divide-y divide-[#E2E8F0]">{keys.map((key) => <tr key={key.id}><td className="p-4 font-semibold text-[#0B192C]">{key.hospital_name}</td><td className="p-4 text-[#475569]">{key.hms_system || key.hms_provider}</td><td className="p-4 font-mono text-[#475569]">{key.masked_prefix}</td><td className="p-4"><span className="rounded-full bg-[#EEF5FC] px-2 py-1 font-mono text-[10px] font-bold text-[#0052FF]">{key.environment.toUpperCase()}</span></td><td className="p-4 font-mono text-[#0B192C]">{key.requests_count}</td><td className="p-4 text-[#64748B]">{key.last_used_at || "Never"}</td><td className="p-4"><span className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold ${key.status === "active" ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#FEE2E2] text-[#DC2626]"}`}>{key.status.toUpperCase()}</span></td><td className="p-4">{key.status === "active" && <button type="button" onClick={() => void revokeKey(key.id)} className="inline-flex items-center gap-1 rounded border border-[#FECACA] px-2.5 py-1.5 font-mono text-[10px] font-bold text-[#DC2626]"><XCircle className="h-3.5 w-3.5" /> REVOKE</button>}</td></tr>)}</tbody></table></div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-sm"><h2 className="font-heading text-xl font-bold text-[#0B192C]">Hospital integration guide</h2><ol className="mt-4 space-y-2 text-sm text-[#475569]"><li><strong className="text-[#0B192C]">1. Attach Bearer Token</strong> — use the generated key in `Authorization` or `X-API-Key`.</li><li><strong className="text-[#0B192C]">2. POST Claim PDFs & Insurer ID</strong> — send JSON base64 documents or multipart PDFs.</li><li><strong className="text-[#0B192C]">3. Gate Discharge on Verdict</strong> — proceed only on `PASS`; remediate `BLOCKED` rules first.</li></ol><div className="mt-5 space-y-3">{Object.entries(snippets).map(([name, value]) => <div key={name} className="rounded-lg bg-[#0B192C] p-3"><div className="mb-2 flex items-center justify-between text-[10px] font-mono font-bold uppercase text-[#93C5FD]"><span>{name}</span><button type="button" onClick={() => void copyText(value, `${name} snippet copied.`)} className="inline-flex items-center gap-1 text-white"><Copy className="h-3.5 w-3.5" /> COPY</button></div><pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-[#E2E8F0]">{value}</pre></div>)}</div></div>
          <div className="rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-heading text-xl font-bold text-[#0B192C]">Test Your API Key Live</h2><p className="mt-1 text-sm text-[#475569]">Executes a real authenticated request against the live backend.</p></div><Play className="h-5 w-5 text-[#0052FF]" /></div><select value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)} className="mt-5 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm"><option value="dengue">{scenarioConfig.dengue.label}</option><option value="cataract">{scenarioConfig.cataract.label}</option></select><button type="button" disabled={testing} onClick={() => void runLiveTest()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0052FF] px-4 py-3 text-xs font-mono font-bold text-white disabled:opacity-60">{testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} SEND AUTHENTICATED REQUEST</button>{testResult && <div className="mt-5 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-4"><div className="flex items-center justify-between text-xs font-mono font-bold"><span className={Number(testResult.http_status) === 200 ? "text-[#15803D]" : "text-[#DC2626]"}>HTTP {String(testResult.http_status)} {Number(testResult.http_status) === 200 ? "OK" : "ERROR"}</span><span className="text-[#64748B]">{String(testResult.response_time_ms)} ms</span></div><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[#334E68]">{JSON.stringify(testResult.response, null, 2)}</pre></div>}</div>
        </section>
        <div className="flex items-start gap-2 text-[11px] text-[#64748B]"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" />Demo documents are synthetic. FHIR R4 is structurally validated locally; NHCX/HCX profile conformance and live gateway submission are not implemented.</div>
      </div>
    </div>
  );
};
