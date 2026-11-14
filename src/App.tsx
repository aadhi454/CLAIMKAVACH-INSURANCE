import React, { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, AlertTriangle, Sparkles } from "lucide-react";
import { AppState, PageView, DemoUser, RuleItem } from "./types/claim";
import { Navbar } from "./components/layout/Navbar";
import { Sidebar } from "./components/layout/Sidebar";
import { Footer } from "./components/layout/Footer";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NewClaimPage } from "./pages/NewClaimPage";
import { VerificationProgressPage } from "./pages/VerificationProgressPage";
import { VerificationResultsPage } from "./pages/VerificationResultsPage";
import { AllClaimsPage } from "./pages/AllClaimsPage";
import { PoliciesPage } from "./pages/PoliciesPage";
import { RulesPage } from "./pages/RulesPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ReviewCenterPage } from "./pages/ReviewCenterPage";
import { IntelligencePage } from "./pages/IntelligencePage";
import { DeveloperPortalPage } from "./pages/DeveloperPortalPage";
import { InsurerPortalPage } from "./pages/InsurerPortalPage";

export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Routing State
  const [currentView, setCurrentView] = useState<PageView>("landing");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [postLoginView, setPostLoginView] = useState<PageView | null>(null);

  // Active Demo User Profile
  const [demoUser, setDemoUser] = useState<DemoUser>({
    username: "billing_admin_01",
    role: "Billing Administrator",
    email: "billing.desk@sunrisemedical.org",
    hospital: "Sunrise Super Speciality Hospital",
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const fetchState = async (claimId?: string) => {
    try {
      setErrorBanner(null);
      const url = claimId
        ? `/api/state?claim_id=${encodeURIComponent(claimId)}`
        : "/api/state?claim_id=__NONE__";
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) {
        setErrorBanner(json.error || "Failed to load application state.");
      } else {
        setAppState(json.data);
      }
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState("__NONE__");
  }, []);

  const runAction = async (
    action: string,
    payload: Record<string, unknown>,
    successToast?: string
  ) => {
    try {
      setBusyAction(action);
      setErrorBanner(null);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrorBanner(json.error || `Action "${action}" failed.`);
        return null;
      }
      if (json.data) {
        setAppState(json.data);
      }
      if (successToast) {
        showToast(successToast);
      }
      return json;
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  // Launch Demo Scenarios (100% Pass or Conflict)
  const handleLaunchDemoScenario = async (preset: "perfect" | "conflict") => {
    setCurrentView("verifying");
    if (preset === "perfect") {
      const res = await runAction(
        "process_claim",
        {
          claim_id: "CLM-100-PASS",
          insurer: "Fictional Insurer A",
          policy_code: "A1",
          claim_type: "Inpatient Cashless",
          relevant_date: "2026-10-10",
          diagnosis: "Dengue Fever",
          care_setting: "inpatient",
          force_fallback: true,
          uploaded_files: [],
          selected_sample_files: [
            "01_clinical_summary.pdf",
            "02_investigation_report.pdf",
            "03_discharge_summary.pdf",
            "04_itemized_estimate.pdf",
          ],
        },
        "Benchmark Case: 4 hospital PDFs parsed, 23 quality checks evaluated (23 PASS · 0 FAIL · 0 REVIEW · Gate Unlocked)."
      );
      if (res) setCurrentView("results");
    } else {
      const res = await runAction(
        "process_claim",
        {
          claim_id: "CLM-CONFLICT-01",
          insurer: "Fictional Insurer A",
          policy_code: "A1",
          claim_type: "Inpatient Cashless",
          relevant_date: "2026-10-10",
          diagnosis: "Dengue Fever",
          care_setting: "inpatient",
          force_fallback: true,
          uploaded_files: [],
          selected_sample_files: [
            "01_clinical_summary.pdf",
            "02_investigation_report.pdf",
            "03_discharge_summary.pdf",
            "04_itemized_estimate.pdf",
            "05_ambiguous_addendum.pdf",
          ],
        },
        "Discrepancy Audit: Conflicting admission dates detected across hospital records."
      );
      if (res) setCurrentView("results");
    }
  };

  // Submit New Claim from Guided PDF Upload Page
  const handleSubmitNewClaim = async (payload: {
    claim_id: string;
    insurer: string;
    policy_code: string;
    claim_type: string;
    relevant_date: string;
    diagnosis: string;
    estimated_amount: string;
    care_setting: string;
    force_fallback: boolean;
    uploaded_files: Array<{ filename: string; base64: string; sizeKb: number }>;
    selected_sample_files: string[];
  }) => {
    setCurrentView("verifying");
    const count = payload.uploaded_files.length + payload.selected_sample_files.length;
    const res = await runAction(
      "process_claim",
      payload,
      `Extracted ${count} document(s) & audited against ${payload.insurer} (${payload.policy_code}) rules.`
    );
    if (res) {
      setCurrentView("results");
    }
  };

  // Select Claim from Dashboard or All Claims
  const handleSelectClaim = async (claimId: string) => {
    await fetchState(claimId);
    setCurrentView("results");
  };

  // Human Reviewer Disposition (Resolves REVIEW to RESOLVED_REVIEW, unblocking FHIR gate)
  const handleRecordDisposition = async (
    findingId: string,
    reviewer: string,
    rationale: string
  ) => {
    if (!appState?.active_claim) return;
    await runAction(
      "record_disposition",
      {
        claim_id: appState.active_claim.claim_id,
        finding_id: findingId,
        reviewer,
        rationale,
      },
      "Recorded signed human review disposition. REVIEW finding resolved."
    );
  };

  // Human Field Correction with Page/Line Provenance
  const handleConfirmFieldEdit = async (
    docId: string,
    fieldName: string,
    newValue: string,
    reviewer: string,
    rationale: string
  ) => {
    if (!appState?.active_claim) return;
    await runAction(
      "confirm_field",
      {
        claim_id: appState.active_claim.claim_id,
        doc_id: docId,
        field_name: fieldName,
        new_value: newValue,
        reviewer,
        rationale,
      },
      `Updated field "${fieldName}" and re-audited claim.`
    );
  };

  // Mock NHCX Gateway Simulation ("auto" or "force_failure")
  const handleRunMockNhcx = async (mode: "auto" | "force_failure") => {
    if (!appState?.active_claim) return null;
    const res = await runAction("mock_nhcx", {
      claim_id: appState.active_claim.claim_id,
      simulate_mode: mode,
    });
    return (res?.mock_response as Record<string, unknown>) || null;
  };

  // Re-evaluate Rules under Current Claim Context
  const handleReevaluateRules = async () => {
    if (!appState?.active_claim) return;
    await runAction(
      "update_claim_context",
      {
        claim_id: appState.active_claim.claim_id,
        insurer: appState.active_claim.insurer,
        policy_code: appState.active_claim.policy_code,
        claim_type: appState.active_claim.claim_type,
        relevant_date: appState.active_claim.relevant_date,
        diagnosis: appState.active_claim.diagnosis,
        care_setting: appState.active_claim.care_setting,
      },
      "Re-evaluated all rules against current clinical evidence."
    );
  };

  // Download HL7 FHIR R4 Draft Bundle JSON
  const handleDownloadFhirBundle = () => {
    if (!appState?.fhir_bundle || !appState.active_claim) return;
    const blob = new Blob([JSON.stringify(appState.fhir_bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${appState.active_claim.claim_id}_fhir_r4_bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded genuine HL7 FHIR R4 Bundle JSON.");
  };

  // Save / Version Rule
  const handleSaveRule = async (rule: Partial<RuleItem>) => {
    await runAction(
      "save_rule",
      { claim_id: appState?.active_claim?.claim_id, rule },
      `Persisted rule version ${rule.rule_id}.`
    );
  };

  // Toggle Rule State (APPROVED vs DEACTIVATED)
  const handleToggleRuleState = async (ruleId: string, newState: "APPROVED" | "DEACTIVATED") => {
    await runAction(
      "rule_state",
      { claim_id: appState?.active_claim?.claim_id, rule_id: ruleId, new_state: newState },
      `Rule ${ruleId} state changed to ${newState}.`
    );
  };

  // Remove Document
  const handleRemoveDocument = async (docId: string) => {
    if (!appState?.active_claim) return;
    await runAction(
      "remove_document",
      { claim_id: appState.active_claim.claim_id, doc_id: docId },
      "Removed document and re-evaluated claim rules."
    );
  };

  // Login Success Handler
  const handleLoginSuccess = (user: DemoUser) => {
    setDemoUser(user);
    setIsLoggedIn(true);
    setCurrentView(user.role === "Insurance Company" ? "insurer-portal" : (postLoginView || "dashboard"));
    setPostLoginView(null);
    showToast(`Welcome back, ${user.username} (${user.role}).`);
  };

  const handleNavigateToApiKeys = () => {
    if (isLoggedIn) {
      setCurrentView("developer-portal");
      return;
    }
    setPostLoginView("developer-portal");
    setCurrentView("login");
  };

  const handleDispatchClaim = async (insurerId: string, policyName: string) => {
    if (!appState?.active_claim || !appState.fhir_bundle) return;
    const claim = appState.active_claim;
    const response = await fetch("/api/claims/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_ref: claim.claim_id,
        hospital_name: demoUser.hospital,
        insurer_id: insurerId,
        policy_name: policyName,
        diagnosis: claim.diagnosis,
        masked_patient_summary: "[NAME_MASKED] [PHONE_MASKED] [GOV_ID_MASKED]",
        rule_audit: appState.findings,
        fhir_bundle: appState.fhir_bundle.bundle,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Claim dispatch failed.");
    showToast(`Transmitted to ${policyName} insurer inbox.`);
    await fetchState(claim.claim_id);
    return payload;
  };

  // Loading Screen
  if (loading && !appState) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 font-mono text-xs">
        <div className="w-12 h-12 bg-[#0A0A0A] text-white flex items-center justify-center rounded-xs mb-4">
          <ShieldCheck className="w-6 h-6 text-[#0022FF]" />
        </div>
        <div className="flex items-center gap-2 text-[#0A0A0A] font-bold">
          <RefreshCw className="w-4 h-4 text-[#0022FF] animate-spin" />
          <span>INITIALIZING CLAIMKAVACH LOCAL WORKSPACE...</span>
        </div>
      </div>
    );
  }

  if (!appState) {
    return (
      <div className="min-h-screen bg-white p-8 font-mono text-xs text-[#D93636]">
        Failed to initialize workspace: {errorBanner}
      </div>
    );
  }

  const activeClaim = appState.active_claim;
  const passCount = appState.findings.filter((f) => f.status === "PASS").length;
  const failCount = appState.findings.filter((f) => f.status === "FAIL").length;
  const reviewCount = appState.findings.filter((f) => f.status === "REVIEW").length;
  const unresolvedReviewCount = appState.findings.filter(
    (f) => f.status === "REVIEW" && !f.review_disposition
  ).length;
  const totalChecks = appState.findings.length;
  const readinessPct =
    totalChecks > 0
      ? Math.round(((passCount + (reviewCount - unresolvedReviewCount)) / totalChecks) * 100)
      : 0;

  // Render Internal View Component
  const renderInternalPage = () => {
    switch (currentView) {
      case "dashboard":
        return (
          <NewClaimPage
            appState={appState}
            onNavigate={setCurrentView}
            onSubmitClaim={handleSubmitNewClaim}
            onLaunchDemoScenario={handleLaunchDemoScenario}
          />
        );
      case "new-claim":
        return (
          <NewClaimPage
            appState={appState}
            onNavigate={setCurrentView}
            onSubmitClaim={handleSubmitNewClaim}
            onLaunchDemoScenario={handleLaunchDemoScenario}
          />
        );
      case "results":
        return (
          <VerificationResultsPage
            appState={appState}
            onNavigate={setCurrentView}
            onRecordDisposition={handleRecordDisposition}
            onConfirmFieldEdit={handleConfirmFieldEdit}
            onRunMockNhcx={handleRunMockNhcx}
            onReevaluateRules={handleReevaluateRules}
            onDownloadFhirBundle={handleDownloadFhirBundle}
            onDispatchClaim={handleDispatchClaim}
          />
        );
      case "all-claims":
        return (
          <AllClaimsPage
            appState={appState}
            onNavigate={setCurrentView}
            onSelectClaim={handleSelectClaim}
          />
        );
      case "review-center":
        return <ReviewCenterPage appState={appState} onNavigate={setCurrentView} onSelectClaim={handleSelectClaim} />;
      case "intelligence":
        return <IntelligencePage appState={appState} onNavigate={setCurrentView} />;
      case "developer-portal":
        return <DeveloperPortalPage appState={appState} onNavigate={setCurrentView} />;
      case "policies":
        return <PoliciesPage appState={appState} onNavigate={setCurrentView} />;
      case "rules":
        return (
          <RulesPage
            appState={appState}
            onNavigate={setCurrentView}
            onSaveRule={handleSaveRule}
            onToggleRuleState={handleToggleRuleState}
          />
        );
      case "documents":
        return (
          <DocumentsPage
            appState={appState}
            onNavigate={setCurrentView}
            onRemoveDocument={handleRemoveDocument}
          />
        );
      case "reports":
        return <ReportsPage appState={appState} onNavigate={setCurrentView} />;
      case "settings":
        return <SettingsPage appState={appState} onNavigate={setCurrentView} />;
      default:
        return (
          <DashboardPage
            appState={appState}
            onNavigate={setCurrentView}
            onSelectClaim={handleSelectClaim}
            onLaunchDemoScenario={handleLaunchDemoScenario}
          />
        );
    }
  };

  return (
    <div className="min-h-screen app-shell text-[#0B192C] flex flex-col selection:bg-[#0052FF] selection:text-white">

      {/* Floating Animated Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#0A0A0A] text-white border-2 border-[#0022FF] px-4 py-2.5 rounded-xs shadow-[4px_4px_0px_0px_#0022FF] flex items-center gap-2.5 text-xs font-mono font-bold">
          <Sparkles className="w-4 h-4 text-[#0022FF]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Global Error Banner */}
      {errorBanner && (
        <div className="bg-[#FEF2F2] border-b border-[#FECACA] px-6 py-2.5 flex items-center justify-between text-xs font-mono text-[#D93636]">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="hover:underline font-bold cursor-pointer"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* VIEW SWITCHING LOGIC */}
      {currentView === "landing" ? (
        <LandingPage
          onNavigate={setCurrentView}
          onLaunchDemoScenario={handleLaunchDemoScenario}
          onNavigateToApiKeys={handleNavigateToApiKeys}
        />
      ) : currentView === "login" ? (
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          onNavigate={setCurrentView}
        />
      ) : currentView === "verifying" ? (
        <VerificationProgressPage
          claimId={activeClaim?.claim_id || "CLM-101"}
          insurer={activeClaim?.insurer || "Fictional Insurer A"}
          policyCode={activeClaim?.policy_code || "A1"}
          diagnosis={activeClaim?.diagnosis || "Dengue Fever"}
          isProcessing={busyAction === "process_claim"}
          onVerificationComplete={() => setCurrentView("results")}
          error={errorBanner}
          onRetry={() => {
            setErrorBanner(null);
            setCurrentView("new-claim");
          }}
        />
      ) : currentView === "insurer-portal" && demoUser.insurerId ? (
        <InsurerPortalPage
          insurer={{
            id: demoUser.insurerId,
            company_name: demoUser.insurerName || "Insurance Company",
            insurer_code: demoUser.insurerCode || "",
            email: demoUser.email,
          }}
          onNavigate={setCurrentView}
          onLogout={() => {
            setIsLoggedIn(false);
            setCurrentView("landing");
          }}
        />
      ) : (
        /* Internal Workspace with Left Sidebar & Main Content */
        <div className="flex-1 flex flex-col lg:flex-row max-w-[1560px] w-full mx-auto">
          <Sidebar
            currentView={currentView}
            onNavigate={setCurrentView}
            user={demoUser}
            onLogout={() => {
              setIsLoggedIn(false);
              setCurrentView("landing");
            }}
            activeClaimId={activeClaim?.claim_id}
            readinessPct={readinessPct}
            unresolvedCount={unresolvedReviewCount}
          />
          <main className="flex-1 min-w-0">
            {renderInternalPage()}
          </main>
        </div>
      )}

    </div>
  );
}
