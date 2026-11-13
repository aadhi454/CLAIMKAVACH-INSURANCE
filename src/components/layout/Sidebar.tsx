import React from "react";
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardCheck,
  Files,
  Sliders,
  FileText,
  BarChart3,
  Settings,
  ShieldCheck,
  LogOut,
  FolderOpen,
} from "lucide-react";
import { PageView, DemoUser } from "../../types/claim";

interface SidebarProps {
  currentView: PageView;
  onNavigate: (view: PageView) => void;
  user: DemoUser;
  onLogout: () => void;
  activeClaimId?: string | null;
  readinessPct?: number;
  unresolvedCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  user,
  onLogout,
  activeClaimId,
  readinessPct = 0,
  unresolvedCount = 0,
}) => {
  const navItems = [
    {
      id: "dashboard" as PageView,
      label: "Overview",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: "new-claim" as PageView,
      label: "New Claim",
      icon: PlusCircle,
      badge: "Workflow",
      highlight: true,
    },
    {
      id: "results" as PageView,
      label: "Verification Results",
      icon: ClipboardCheck,
      badge: activeClaimId ? `${readinessPct}%` : null,
      disabled: !activeClaimId,
    },
    {
      id: "all-claims" as PageView,
      label: "All Claims",
      icon: Files,
      badge: null,
    },
    {
      id: "policies" as PageView,
      label: "Policies",
      icon: FolderOpen,
      badge: "4 Active",
    },
    {
      id: "rules" as PageView,
      label: "Verification Rules",
      icon: Sliders,
      badge: null,
    },
    {
      id: "documents" as PageView,
      label: "Documents",
      icon: FileText,
      badge: null,
    },
    {
      id: "reports" as PageView,
      label: "Reports",
      icon: BarChart3,
      badge: null,
    },
    {
      id: "settings" as PageView,
      label: "Settings & System",
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <aside className="w-64 bg-[#FFFFFF] border-r border-[#D9D9D9] flex flex-col justify-between shrink-0 min-h-[calc(100vh-4.5rem)] sticky top-18">
      {/* Top Section */}
      <div className="p-4 space-y-6">
        {/* Active Claim Indicator */}
        {activeClaimId && (
          <div className="p-3 bg-[#F0F3FF] border border-[#0022FF]/30 rounded-xs space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[#0022FF] uppercase tracking-wider">
              <span>Active Claim</span>
              <span>{readinessPct}% Ready</span>
            </div>
            <div className="font-mono font-bold text-xs text-[#0A0A0A] truncate">
              {activeClaimId}
            </div>
            {unresolvedCount > 0 ? (
              <div className="text-[10px] text-[#D93636] font-mono font-bold">
                ● {unresolvedCount} item(s) need review
              </div>
            ) : (
              <div className="text-[10px] text-[#16834A] font-mono font-bold">
                ● 100% Gated & Ready
              </div>
            )}
          </div>
        )}

        {/* Navigation list */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono tracking-wider transition-all rounded-xs text-left ${
                  isActive
                    ? "bg-[#0A0A0A] text-white font-bold"
                    : item.disabled
                    ? "text-[#94A3B8] opacity-50 cursor-not-allowed"
                    : item.highlight
                    ? "text-[#0022FF] hover:bg-[#F0F3FF] font-bold"
                    : "text-[#0A0A0A] hover:bg-[#F5F5F5]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? "text-white"
                        : item.highlight
                        ? "text-[#0022FF]"
                        : "text-[#64748B]"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-xs font-mono font-bold ${
                      isActive
                        ? "bg-white text-[#0A0A0A]"
                        : item.highlight
                        ? "bg-[#0022FF] text-white"
                        : "bg-[#F5F5F5] text-[#64748B] border border-[#D9D9D9]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Logout */}
      <div className="p-4 border-t border-[#D9D9D9] space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#0A0A0A] text-white flex items-center justify-center font-mono text-xs font-bold">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-[#0A0A0A] truncate">
              {user.username}
            </div>
            <div className="text-[10px] font-mono text-[#64748B] truncate">
              {user.role}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono text-[#64748B] hover:text-[#D93636] hover:bg-[#F5F5F5] transition-colors rounded-xs border border-transparent hover:border-[#D9D9D9]"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit Workspace</span>
        </button>

        <div className="pt-1 text-[10px] font-mono text-[#64748B] text-center font-semibold">
          ABDM / NHCX COMPLIANT NODE · v2.4.0
        </div>
      </div>
    </aside>
  );
};
