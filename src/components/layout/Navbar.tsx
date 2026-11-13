import React from "react";
import { ArrowRight, Lock } from "lucide-react";
import { PageView } from "../../types/claim";
import { ClaimKavachLogo } from "../common/ClaimKavachLogo";

interface NavbarProps {
  currentView: PageView;
  onNavigate: (view: PageView) => void;
  isLoggedIn: boolean;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  isLoggedIn,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#D9D9D9]">
      <div className="max-w-[1360px] mx-auto px-6 h-18 flex items-center justify-between">
        {/* Brand Logo with Vector Shield + Heart */}
        <div
          onClick={() => onNavigate("landing")}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <ClaimKavachLogo size={38} variant="image" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading font-extrabold text-xl tracking-tight text-[#0A0A0A]">
                CLAIM<span className="text-[#0022FF]">KAVACH</span>
              </span>
              <span className="bg-[#F0F3FF] border border-[#0022FF]/30 text-[#0022FF] text-[10px] font-mono px-1.5 py-0.5 font-bold uppercase tracking-wider rounded-xs">
                ABDM / NHCX READY
              </span>
            </div>
            <p className="text-[11px] text-[#64748B] font-mono uppercase tracking-widest hidden sm:block">
              Hospital Claim Pre-Submission Intelligence
            </p>
          </div>
        </div>

        {/* Public Center Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-mono font-medium tracking-wide">
          <button
            type="button"
            onClick={() => onNavigate("landing")}
            className={`transition-colors hover:text-[#0022FF] cursor-pointer ${
              currentView === "landing" ? "text-[#0022FF] font-bold" : "text-[#0A0A0A]"
            }`}
          >
            01. PRODUCT
          </button>
          <a
            href="#how-it-works"
            onClick={(e) => {
              if (currentView !== "landing") {
                e.preventDefault();
                onNavigate("landing");
                setTimeout(() => {
                  document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                }, 100);
              }
            }}
            className="text-[#0A0A0A] hover:text-[#0022FF] transition-colors cursor-pointer"
          >
            02. HOW IT WORKS
          </a>
          <a
            href="#capabilities"
            onClick={(e) => {
              if (currentView !== "landing") {
                e.preventDefault();
                onNavigate("landing");
                setTimeout(() => {
                  document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" });
                }, 100);
              }
            }}
            className="text-[#0A0A0A] hover:text-[#0022FF] transition-colors cursor-pointer"
          >
            03. CAPABILITIES
          </a>
          <a
            href="#sample-audit"
            onClick={(e) => {
              if (currentView !== "landing") {
                e.preventDefault();
                onNavigate("landing");
                setTimeout(() => {
                  document.getElementById("sample-audit")?.scrollIntoView({ behavior: "smooth" });
                }, 100);
              }
            }}
            className="text-[#0A0A0A] hover:text-[#0022FF] transition-colors cursor-pointer"
          >
            04. BENCHMARK AUDIT
          </a>
        </nav>

        {/* Right CTA Actions */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <button
              type="button"
              onClick={() => onNavigate("dashboard")}
              className="px-5 py-2.5 rounded-full bg-[#0A0A0A] hover:bg-[#0022FF] text-white text-xs font-mono font-semibold tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              WORKSPACE CONSOLE
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onNavigate("login")}
                className="px-4 py-2 text-xs font-mono font-bold tracking-wider text-[#0A0A0A] hover:text-[#0022FF] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Lock className="w-3 h-3 text-[#64748B]" />
                SIGN IN
              </button>
              <button
                type="button"
                onClick={() => onNavigate("new-claim")}
                className="px-5 py-2.5 rounded-full bg-[#0022FF] hover:bg-[#0044FF] text-white text-xs font-mono font-bold tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                START AUDIT
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
