import React, { useState } from "react";
import {
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Building2,
  UserCheck,
} from "lucide-react";
import { PageView, DemoUser } from "../types/claim";
import { ClaimKavachLogo } from "../components/common/ClaimKavachLogo";

interface LoginPageProps {
  onLoginSuccess: (user: DemoUser) => void;
  onNavigate: (view: PageView) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onNavigate,
}) => {
  const [username, setUsername] = useState("billing_admin_01");
  const [password, setPassword] = useState("claimkavach2026");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      if (password.length < 4) {
        setError("Invalid credentials. Password must be at least 4 characters.");
        return;
      }

      onLoginSuccess({
        username: username.trim(),
        role: "Billing Administrator",
        email: `${username.trim().toLowerCase()}@sunrise-hospital.org`,
        hospital: "Sunrise Super Speciality Hospital",
      });
    }, 400);
  };

  const handleQuickRoleSelect = (role: "Billing Administrator" | "Claims Auditor") => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLoginSuccess({
        username: role === "Billing Administrator" ? "billing_head_01" : "compliance_auditor_02",
        role: role,
        email: role === "Billing Administrator" ? "billing@sunrise-hospital.org" : "auditor@tpa-network.org",
        hospital: "Sunrise Super Speciality Hospital",
      });
    }, 300);
  };

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] flex flex-col md:flex-row selection:bg-[#0022FF] selection:text-white font-sans">
      {/* LEFT EDITORIAL COLUMN */}
      <div className="md:w-1/2 bg-[#0A0A0A] text-white p-8 sm:p-12 md:p-16 flex flex-col justify-between border-r border-[#262626] relative overflow-hidden">
        {/* Abstract background grid */}
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

        <div className="relative z-10 space-y-8">
          <button
            type="button"
            onClick={() => onNavigate("landing")}
            className="inline-flex items-center gap-2 text-xs font-mono text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            BACK TO HOMEPAGE
          </button>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ClaimKavachLogo size={44} variant="image" />
              <div>
                <span className="font-heading font-extrabold text-2xl tracking-tight text-white block">
                  CLAIM<span className="text-[#0022FF]">KAVACH</span>
                </span>
                <span className="text-[10px] font-mono text-[#94A3B8] tracking-widest uppercase">
                  ENTERPRISE HEALTHCARE NODE
                </span>
              </div>
            </div>
            <div className="inline-block bg-[#1E293B] border border-[#334155] text-[#38BDF8] text-[11px] font-mono px-2.5 py-0.5 uppercase tracking-wider font-bold rounded-xs">
              ABDM & NHCX SECURE GATEWAY
            </div>
          </div>

          <div className="space-y-4 max-w-md pt-4">
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-white tracking-tight leading-tight">
              Hospital claim verification control room.
            </h1>
            <p className="text-sm text-[#94A3B8] font-sans leading-relaxed">
              Sign in to manage uploaded patient claims, inspect cross-document consistency checks,
              enforce active insurer rules, and export gated FHIR R4 standard bundles.
            </p>
          </div>
        </div>

        <div className="relative z-10 space-y-4 pt-12 border-t border-[#262626]">
          <div className="grid grid-cols-2 gap-4 text-xs font-mono text-[#94A3B8]">
            <div>
              <span className="text-white font-bold block">Local-First Vault:</span>
              <span>Zero-Leakage On-Prem PII Tokenization</span>
            </div>
            <div>
              <span className="text-white font-bold block">Interoperability:</span>
              <span>HL7 FHIR R4 (4.0.1) & NHCX Compliant</span>
            </div>
          </div>

          <p className="text-[10px] font-mono text-[#64748B]">
            Secured Session · End-to-End Local Cryptographic Hash Audit Logging Active
          </p>
        </div>
      </div>

      {/* RIGHT LOGIN FORM COLUMN */}
      <div className="md:w-1/2 p-8 sm:p-12 md:p-16 flex flex-col justify-center max-w-xl mx-auto w-full">
        <div className="space-y-8">
          <div>
            <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#0A0A0A] tracking-tight">
              Sign in to Workspace
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] mt-1 font-sans">
              Access your hospital billing station or select a role profile below.
            </p>
          </div>

          {/* Quick Role Profiles */}
          <div className="space-y-2.5">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
              Quick Role Selection
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickRoleSelect("Billing Administrator")}
                className="p-3 bg-[#F5F5F5] hover:bg-[#F0F3FF] border border-[#D9D9D9] hover:border-[#0022FF] text-left transition-all rounded-xs cursor-pointer group"
              >
                <div className="flex items-center justify-between text-xs font-mono font-bold text-[#0A0A0A] group-hover:text-[#0022FF]">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#0022FF]" />
                    Billing Administrator
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
                <div className="text-[11px] text-[#64748B] mt-1 font-sans">
                  Full workflow & claim validation
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRoleSelect("Claims Auditor")}
                className="p-3 bg-[#F5F5F5] hover:bg-[#F0F3FF] border border-[#D9D9D9] hover:border-[#0022FF] text-left transition-all rounded-xs cursor-pointer group"
              >
                <div className="flex items-center justify-between text-xs font-mono font-bold text-[#0A0A0A] group-hover:text-[#0022FF]">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[#0022FF]" />
                    Claims Auditor
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
                <div className="text-[11px] text-[#64748B] mt-1 font-sans">
                  Policy rules & audit trail review
                </div>
              </button>
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-[#D9D9D9] w-full" />
            <span className="bg-white px-3 text-[11px] font-mono text-[#94A3B8] uppercase tracking-wider absolute">
              OR ENTER CREDENTIALS
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
            {error && (
              <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xs text-[#D93636] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="font-bold text-[#0A0A0A] uppercase tracking-wider block">
                Username / Employee ID
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="billing_admin_01"
                className="w-full px-3.5 py-2.5 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:outline-none focus:border-[#0022FF]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-[#0A0A0A] uppercase tracking-wider block">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:outline-none focus:border-[#0022FF]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0A0A0A]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-full bg-[#0022FF] hover:bg-[#0044FF] disabled:bg-[#CBD5E1] text-white font-mono text-xs font-bold tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <span>AUTHENTICATING NODE...</span>
              ) : (
                <>
                  <span>SIGN IN TO WORKSPACE</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
