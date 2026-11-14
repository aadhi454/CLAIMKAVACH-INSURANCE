import React, { useState } from "react";
import { ArrowLeft, Building2, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { PageView, DemoUser } from "../types/claim";
import { ClaimKavachLogo } from "../components/common/ClaimKavachLogo";

interface LoginPageProps {
  onLoginSuccess: (user: DemoUser) => void;
  onNavigate: (view: PageView) => void;
}

type LoginRole = "hospital" | "insurer";

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, onNavigate }) => {
  const [role, setRole] = useState<LoginRole>("hospital");
  const [insurerMode, setInsurerMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("admin@claimkavach.in");
  const [password, setPassword] = useState("demo123");
  const [companyName, setCompanyName] = useState("");
  const [insurerCode, setInsurerCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectRole = (nextRole: LoginRole) => {
    setRole(nextRole);
    setError(null);
    if (nextRole === "hospital") {
      setEmail("admin@claimkavach.in");
      setPassword("demo123");
    } else {
      setEmail("payer@starhealth.in");
      setPassword("demo123");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (role === "hospital") {
        if (email.trim().toLowerCase() !== "admin@claimkavach.in" || password !== "demo123") {
          throw new Error("Use the demo hospital credentials: admin@claimkavach.in / demo123.");
        }
        onLoginSuccess({
          username: email.trim(),
          role: "Billing Administrator",
          email: email.trim().toLowerCase(),
          hospital: "Manipal Hospital - Whitefield Desk",
        });
        return;
      }
      if (insurerMode === "register") {
        const response = await fetch("/api/insurers/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name: companyName, insurer_code: insurerCode, email, password }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Insurer registration failed.");
        onLoginSuccess({ username: payload.email, role: "Insurance Company", email: payload.email, hospital: "", insurerId: payload.id, insurerName: payload.company_name, insurerCode: payload.insurer_code });
        return;
      }
      const response = await fetch("/api/insurers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Invalid insurer credentials.");
      onLoginSuccess({ username: payload.email, role: "Insurance Company", email: payload.email, hospital: "", insurerId: payload.id, insurerName: payload.company_name, insurerCode: payload.insurer_code });
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#EEF5FC_0%,#DCE8F6_100%)] p-6 text-[#0B192C]">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-[0_20px_50px_-25px_rgba(11,25,44,.35)] lg:grid-cols-[.9fr_1.1fr]">
          <div className="hidden bg-[#0B192C] p-10 text-white lg:flex lg:flex-col lg:justify-between"><button type="button" onClick={() => onNavigate("landing")} className="inline-flex items-center gap-2 self-start text-xs font-mono text-[#CBD5E1]"><ArrowLeft className="h-4 w-4" /> BACK TO HOMEPAGE</button><div><div className="flex items-center gap-3"><ClaimKavachLogo size={44} variant="image" /><span className="font-heading text-2xl font-extrabold">CLAIM<span className="text-[#60A5FA]">KAVACH</span></span></div><h1 className="mt-12 font-heading text-4xl font-extrabold leading-tight">One deterministic network for hospitals and payers.</h1><p className="mt-5 text-sm leading-6 text-[#CBD5E1]">Local PII masking, policy-aware document checks, and gated FHIR R4 exchange across both portals.</p></div><div className="text-xs font-mono text-[#94A3B8]">ABDM & NHCX SECURE GATEWAY · LOCAL-FIRST AUDIT VAULT</div></div>
          <div className="p-7 sm:p-12"><div className="flex items-center gap-3 lg:hidden"><ClaimKavachLogo size={38} variant="image" /><span className="font-heading text-xl font-extrabold">CLAIM<span className="text-[#0052FF]">KAVACH</span></span></div><div className="mt-7 lg:mt-0"><div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0052FF]">CLOSED-LOOP ACCESS</div><h2 className="mt-2 font-heading text-3xl font-extrabold">Choose your workspace</h2><p className="mt-2 text-sm text-[#64748B]">The same deterministic audit trail connects hospital billing desks to insurer payer teams.</p></div>
            <div className="mt-7 grid grid-cols-2 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-1"><button type="button" onClick={() => selectRole("hospital")} className={`rounded-md px-3 py-3 text-xs font-mono font-bold ${role === "hospital" ? "bg-white text-[#0052FF] shadow-sm" : "text-[#64748B]"}`}><Building2 className="mx-auto mb-1 h-4 w-4" />HOSPITAL ADMIN</button><button type="button" onClick={() => selectRole("insurer")} className={`rounded-md px-3 py-3 text-xs font-mono font-bold ${role === "insurer" ? "bg-white text-[#0052FF] shadow-sm" : "text-[#64748B]"}`}><ShieldCheck className="mx-auto mb-1 h-4 w-4" />INSURANCE COMPANY</button></div>
            {role === "insurer" && <div className="mt-5 flex gap-4 border-b border-[#E2E8F0] text-xs font-mono font-bold"><button type="button" onClick={() => setInsurerMode("signin")} className={`border-b-2 pb-2 ${insurerMode === "signin" ? "border-[#0052FF] text-[#0052FF]" : "border-transparent text-[#64748B]"}`}>INSURER SIGN IN</button><button type="button" onClick={() => setInsurerMode("register")} className={`border-b-2 pb-2 ${insurerMode === "register" ? "border-[#0052FF] text-[#0052FF]" : "border-transparent text-[#64748B]"}`}>REGISTER NEW INSURER</button></div>}
            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              {error && <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">{error}</div>}
              {role === "insurer" && insurerMode === "register" && <><label className="block text-xs font-mono font-bold text-[#475569]">COMPANY NAME<input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="mt-2 w-full rounded-lg border border-[#CBD5E1] px-3 py-3 text-sm font-sans" placeholder="Star Health Demo" /></label><label className="block text-xs font-mono font-bold text-[#475569]">INSURER CODE<input required value={insurerCode} onChange={(event) => setInsurerCode(event.target.value)} className="mt-2 w-full rounded-lg border border-[#CBD5E1] px-3 py-3 text-sm font-sans" placeholder="INS-STAR-01" /></label></>}
              <label className="block text-xs font-mono font-bold text-[#475569]">WORK EMAIL<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-[#CBD5E1] px-3 py-3 text-sm font-sans" /></label>
              <label className="block text-xs font-mono font-bold text-[#475569]">PASSWORD<div className="relative mt-2"><input required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-[#CBD5E1] px-3 py-3 pr-10 text-sm font-sans" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
              <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0052FF] px-4 py-3.5 text-xs font-mono font-bold text-white disabled:opacity-60"><Lock className="h-4 w-4" />{loading ? "AUTHENTICATING..." : role === "hospital" ? "ENTER HOSPITAL WORKSPACE" : insurerMode === "signin" ? "ENTER PAYER WORKSPACE" : "REGISTER INSURER"}</button>
            </form>
            <div className="mt-6 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3 text-xs text-[#1E40AF]">{role === "hospital" ? "Demo hospital: admin@claimkavach.in / demo123" : "Demo insurer: payer@starhealth.in / demo123"}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
