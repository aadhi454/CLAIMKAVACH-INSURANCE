import React, { useState, useRef } from "react";
import {
  Upload,
  FileText,
  Trash2,
  ArrowRight,
  Check,
  Sparkles,
  AlertCircle,
  FolderPlus,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Layers,
  FileCheck2,
} from "lucide-react";
import { AppState, PageView } from "../types/claim";
import { convertPdfFileToBase64, getSamplePdfDownloadUrl } from "../services/api";

interface NewClaimPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
  onSubmitClaim: (payload: {
    claim_id: string;
    insurer: string;
    policy_code: string;
    claim_type: string;
    relevant_date: string;
    diagnosis: string;
    care_setting: string;
    force_fallback: boolean;
    uploaded_files: Array<{ filename: string; base64: string; sizeKb: number }>;
    selected_sample_files: string[];
  }) => void;
  onLaunchDemoScenario: (preset: "perfect" | "conflict") => void;
}

const SAMPLE_FILES_CATALOG: Record<
  string,
  { label: string; docType: string; hint: string; badge: string }
> = {
  "01_clinical_summary.pdf": {
    label: "01_clinical_summary.pdf",
    docType: "Clinical Summary",
    hint: "Patient demographics, UHID, Dengue diagnosis, Admission Date: 2026-10-10",
    badge: "Clinical",
  },
  "02_investigation_report.pdf": {
    label: "02_investigation_report.pdf",
    docType: "Pathology Lab Report",
    hint: "NS1 Antigen Positive, Platelet count: 58,000 /cumm",
    badge: "Diagnostic",
  },
  "03_discharge_summary.pdf": {
    label: "03_discharge_summary.pdf",
    docType: "Discharge Summary",
    hint: "Admission & Discharge Dates (2026-10-10 to 2026-10-14), final clinical status",
    badge: "Discharge",
  },
  "04_itemized_estimate.pdf": {
    label: "04_itemized_estimate.pdf",
    docType: "Itemized Tariff Estimate",
    hint: "Room rent (₹4,500/day), lab fees, medical consumables, Total: ₹42,500",
    badge: "Billing",
  },
  "05_ambiguous_addendum.pdf": {
    label: "05_ambiguous_addendum.pdf",
    docType: "Conflict Addendum",
    hint: "Conflicting admission date test (2026-10-12 vs 2026-10-10)",
    badge: "Discrepancy Test",
  },
  "05b_pending_serology_slip.pdf": {
    label: "05b_pending_serology_slip.pdf",
    docType: "Pending Lab Slip",
    hint: "Pending lab slip ('Sample Sent — Report Awaited') triggers REVIEW",
    badge: "Pending Lab Test",
  },
  "06_scanned_raster_only.pdf": {
    label: "06_scanned_raster_only.pdf",
    docType: "Scanned Raster PDF",
    hint: "Image-only PDF without digital font layer (triggers local Tesseract OCR)",
    badge: "OCR Test",
  },
  "07_photo_id_proof.pdf": {
    label: "07_photo_id_proof.pdf",
    docType: "KYC Photo ID Card",
    hint: "Patient government photo ID proof card (Required by Insurer B / Policy B1)",
    badge: "KYC",
  },
};

export const NewClaimPage: React.FC<NewClaimPageProps> = ({
  appState,
  onNavigate,
  onSubmitClaim,
  onLaunchDemoScenario,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Target Policy & Context (Payer configuration)
  const [claimId, setClaimId] = useState(`CLM-${Math.floor(100 + Math.random() * 900)}`);
  const [insurer, setInsurer] = useState("Fictional Insurer A");
  const [policyCode, setPolicyCode] = useState("A1");
  const [claimType, setClaimType] = useState("Inpatient Cashless");
  const [admissionDate, setAdmissionDate] = useState("2026-10-10");
  const [diagnosis, setDiagnosis] = useState("Dengue Fever");
  const [careSetting, setCareSetting] = useState("inpatient");
  const [forceFallback, setForceFallback] = useState(true);

  // Uploaded Files & Sample Selection
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ filename: string; base64: string; sizeKb: number }>
  >([]);
  const [selectedSampleFiles, setSelectedSampleFiles] = useState<string[]>([
    "01_clinical_summary.pdf",
    "02_investigation_report.pdf",
    "03_discharge_summary.pdf",
    "04_itemized_estimate.pdf",
  ]);

  const [showSampleDrawer, setShowSampleDrawer] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const totalStagedCount = uploadedFiles.length + selectedSampleFiles.length;

  const handleFileUpload = async (files: FileList | File[]) => {
    try {
      setErrorMessage(null);
      const items: Array<{ filename: string; base64: string; sizeKb: number }> = [];
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".pdf")) {
          setErrorMessage(`Skipped "${file.name}": Only PDF files are supported.`);
          continue;
        }
        const converted = await convertPdfFileToBase64(file);
        items.push(converted);
      }
      if (items.length > 0) {
        setUploadedFiles((prev) => {
          const names = new Set(prev.map((p) => p.filename));
          const filtered = items.filter((it) => !names.has(it.filename));
          return [...prev, ...filtered];
        });
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAttachPerfectPacket = () => {
    setSelectedSampleFiles([
      "01_clinical_summary.pdf",
      "02_investigation_report.pdf",
      "03_discharge_summary.pdf",
      "04_itemized_estimate.pdf",
    ]);
    setPolicyCode("A1");
    setInsurer("Fictional Insurer A");
    setAdmissionDate("2026-10-10");
    setDiagnosis("Dengue Fever");
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    if (totalStagedCount === 0) {
      setErrorMessage("Please upload at least one hospital PDF or select sample files to verify.");
      return;
    }

    onSubmitClaim({
      claim_id: claimId.trim() || `CLM-${Math.floor(100 + Math.random() * 900)}`,
      insurer,
      policy_code: policyCode,
      claim_type: claimType,
      relevant_date: admissionDate,
      diagnosis,
      care_setting: careSetting,
      force_fallback: forceFallback,
      uploaded_files: uploadedFiles,
      selected_sample_files: selectedSampleFiles,
    });
  };

  return (
    <div className="max-w-[1180px] mx-auto p-6 md:p-10 space-y-8 font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-[#0022FF] uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#0022FF] animate-pulse" />
            STEP 01 OF 04 · DOCUMENT UPLOAD & INGESTION
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-[#0A0A0A] tracking-tight">
            Upload Hospital Claim Documents
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] font-sans max-w-2xl">
            Upload raw PDF documents. ClaimKavach's local PyMuPDF & OCR pipeline automatically extracts
            patient demographics, admission/discharge dates, diagnosis, platelet counts, tariff breakdown,
            and amounts. <strong>No manual form typing required.</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onLaunchDemoScenario("perfect")}
            className="px-4 py-2.5 rounded-full bg-[#F0FDF4] border border-[#BBF7D0] text-[#16834A] font-mono text-xs font-bold tracking-wider hover:bg-[#16834A] hover:text-white transition-all flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#16834A]" />
            PRELOAD BENCHMARK CASE (100% PASS)
          </button>
        </div>
      </div>

      {/* Guided Workflow Stepper Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-3 border-t-4 border-[#0022FF] bg-[#F0F3FF] rounded-xs">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#0022FF]">
            <span>01.</span>
            <span>Upload Documents</span>
          </div>
          <p className="text-[11px] text-[#475569] mt-0.5 font-mono">Select PDFs & Target Payer</p>
        </div>

        <div className="p-3 border-t-4 border-[#D9D9D9] bg-[#F5F5F5] opacity-60 rounded-xs">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#64748B]">
            <span>02.</span>
            <span>AI Extraction</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-0.5 font-mono">PyMuPDF / OCR & PII Masking</p>
        </div>

        <div className="p-3 border-t-4 border-[#D9D9D9] bg-[#F5F5F5] opacity-60 rounded-xs">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#64748B]">
            <span>03.</span>
            <span>Audit & Provenance</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-0.5 font-mono">Rules Checklist & Inline Dispositions</p>
        </div>

        <div className="p-3 border-t-4 border-[#D9D9D9] bg-[#F5F5F5] opacity-60 rounded-xs">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#64748B]">
            <span>04.</span>
            <span>Gated FHIR R4</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-0.5 font-mono">Bundle JSON & Mock NHCX Gateway</p>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xs text-xs font-mono text-[#D93636] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* MAIN UPLOAD & PAYER SELECTION CARD */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border-2 border-[#0A0A0A] p-6 sm:p-8 space-y-6 shadow-[8px_8px_0px_0px_#0A0A0A] rounded-xs">
          {/* Section 1: Payer & Policy Configuration */}
          <div>
            <div className="flex items-center justify-between border-b border-[#D9D9D9] pb-3 mb-4">
              <h2 className="font-heading font-bold text-base text-[#0A0A0A]">
                1. Target Payer & Hospital Admission Context
              </h2>
              <span className="text-[11px] font-mono text-[#64748B]">
                Determines applicable policy rules in SQLite
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wider text-[#0A0A0A] block">
                  Insurer & Policy
                </label>
                <select
                  value={policyCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setPolicyCode(code);
                    const found = appState.policy_configs.find((p) => p.policy_code === code);
                    if (found) setInsurer(found.insurer);
                  }}
                  className="w-full px-3 py-2 bg-white border border-[#D9D9D9] rounded-xs font-bold text-[#0A0A0A] focus:border-[#0022FF] focus:outline-none"
                >
                  {appState.policy_configs.map((pc) => (
                    <option key={pc.policy_code} value={pc.policy_code}>
                      {pc.insurer} — Policy {pc.policy_code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wider text-[#0A0A0A] block">
                  Claim Reference ID
                </label>
                <input
                  type="text"
                  value={claimId}
                  onChange={(e) => setClaimId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#D9D9D9] rounded-xs font-bold text-[#0A0A0A] focus:border-[#0022FF] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wider text-[#0A0A0A] block">
                  Admission Date
                </label>
                <input
                  type="date"
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:border-[#0022FF] focus:outline-none"
                />
                <span className="text-[10px] text-[#64748B]">
                  Active rule window: 2026-01-01 to 2027-12-31
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono mt-3">
              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wider text-[#0A0A0A] block">
                  Claim Type
                </label>
                <select
                  value={claimType}
                  onChange={(e) => setClaimType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:border-[#0022FF] focus:outline-none"
                >
                  <option value="Inpatient Cashless">Inpatient Cashless</option>
                  <option value="Cashless Pre-Auth">Cashless Pre-Auth</option>
                  <option value="Final Discharge">Final Discharge</option>
                  <option value="Reimbursement">Reimbursement</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold uppercase tracking-wider text-[#0A0A0A] block">
                  Care Setting
                </label>
                <select
                  value={careSetting}
                  onChange={(e) => setCareSetting(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:border-[#0022FF] focus:outline-none"
                >
                  <option value="inpatient">Inpatient Stay (IMP)</option>
                  <option value="daycare">Daycare (SS)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Drag and Drop PDF Dropzone */}
          <div className="space-y-4 pt-4 border-t border-[#D9D9D9]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-heading font-bold text-base text-[#0A0A0A]">
                2. Upload Claim Documents (Hospital PDFs)
              </h2>
              <span className="text-xs font-mono font-bold text-[#0022FF]">
                {totalStagedCount} Document(s) Staged
              </span>
            </div>

            {/* Drag & Drop Box */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                if (e.dataTransfer.files) {
                  handleFileUpload(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed p-8 sm:p-10 text-center transition-all cursor-pointer rounded-xs ${
                isDraggingOver
                  ? "border-[#0022FF] bg-[#F0F3FF]"
                  : "border-[#D9D9D9] hover:border-[#0022FF] bg-[#F5F5F5]/60 hover:bg-[#F0F3FF]/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={(e) => {
                  if (e.target.files) handleFileUpload(e.target.files);
                }}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-full bg-white border border-[#D9D9D9] flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Upload className="w-6 h-6 text-[#0022FF]" />
              </div>
              <p className="text-sm font-bold text-[#0A0A0A]">
                Click to browse hospital PDF files or drag & drop here
              </p>
              <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto font-sans">
                Upload any combination of Clinical Summary, Investigation / Pathology Report, Discharge
                Summary, Itemized Tariff Estimate, or KYC ID Proof (max 20 MB per PDF).
              </p>
            </div>

            {/* 1-Click Benchmark Case Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xs text-xs font-mono text-[#16834A]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#16834A]" />
                <span>
                  Preload verified inpatient hospital records (Clinical Summary, Lab Report, Discharge Summary, Itemized Tariff) in 1-click:
                </span>
              </div>
              <button
                type="button"
                onClick={handleAttachPerfectPacket}
                className="px-4 py-1.5 bg-[#16834A] hover:bg-[#15803D] text-white font-bold rounded-xs cursor-pointer transition-colors shrink-0"
              >
                Preload 4 Benchmark PDFs
              </button>
            </div>

            {/* Staged Files Display */}
            {totalStagedCount > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold">
                  <span className="text-[#0A0A0A]">
                    Staged Documents Ready for AI Extraction ({totalStagedCount})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedFiles([]);
                      setSelectedSampleFiles([]);
                    }}
                    className="text-[#D93636] hover:underline"
                  >
                    Clear All
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  {/* Uploaded User PDFs */}
                  {uploadedFiles.map((uf, i) => (
                    <div
                      key={`uf-${i}`}
                      className="flex items-center justify-between p-3 bg-white border border-[#D9D9D9] rounded-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-[#0022FF] shrink-0" />
                        <span className="truncate font-semibold text-[#0A0A0A]">{uf.filename}</span>
                        <span className="text-[#64748B]">({uf.sizeKb} KB)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-[#64748B] hover:text-[#D93636] p-1"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Selected Built-in Sample PDFs */}
                  {selectedSampleFiles.map((sf) => {
                    const meta = SAMPLE_FILES_CATALOG[sf];
                    return (
                      <div
                        key={`sf-${sf}`}
                        className="flex items-center justify-between p-3 bg-[#F0F3FF] border border-[#0022FF]/30 rounded-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-[#0022FF] shrink-0" />
                          <div className="truncate">
                            <span className="truncate font-bold text-[#0022FF]">{sf}</span>
                            <div className="text-[10px] text-[#64748B] truncate">
                              {meta?.docType || "Hospital Record"}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedSampleFiles((prev) => prev.filter((f) => f !== sf))}
                          className="text-[#0022FF] hover:text-[#D93636] p-1"
                          title="Remove sample"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Expandable Standard Clinical Test Library Drawer */}
            <div className="border border-[#D9D9D9] rounded-xs bg-[#F5F5F5] overflow-hidden text-xs font-mono">
              <button
                type="button"
                onClick={() => setShowSampleDrawer(!showSampleDrawer)}
                className="w-full px-4 py-3 flex items-center justify-between font-bold text-[#475569] hover:text-[#0A0A0A] cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-[#0022FF]" />
                  Standard Clinical Inpatient Library (8 Hospital Records)
                </span>
                <span className="text-[#0022FF]">
                  {showSampleDrawer ? "Hide Library" : "Browse Library"}
                </span>
              </button>

              {showSampleDrawer && (
                <div className="p-4 bg-white border-t border-[#D9D9D9] space-y-3">
                  <p className="text-[11px] text-[#64748B]">
                    Click any fictional document to stage it for verification, or click the link icon to inspect the raw PDF:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {Object.entries(SAMPLE_FILES_CATALOG).map(([fname, meta]) => {
                      const isSelected = selectedSampleFiles.includes(fname);
                      return (
                        <div
                          key={fname}
                          className={`p-3 border rounded-xs flex items-start justify-between gap-2 transition-all ${
                            isSelected
                              ? "border-[#0022FF] bg-[#F0F3FF]"
                              : "border-[#D9D9D9] hover:border-[#64748B] bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSampleFiles((prev) =>
                                prev.includes(fname)
                                  ? prev.filter((f) => f !== fname)
                                  : [...prev, fname]
                              );
                            }}
                            className="text-left flex-1 min-w-0 cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 font-bold text-[#0A0A0A] truncate">
                              <span className={isSelected ? "text-[#0022FF]" : "text-[#64748B]"}>
                                {isSelected ? "✓" : "+"}
                              </span>
                              <span className="truncate">{meta.label}</span>
                            </div>
                            <div className="text-[10px] text-[#0022FF] font-semibold mt-0.5">
                              {meta.docType} · <span className="text-[#64748B]">{meta.badge}</span>
                            </div>
                            <div className="text-[11px] text-[#64748B] mt-1 font-sans line-clamp-2">
                              {meta.hint}
                            </div>
                          </button>
                          <a
                            href={getSamplePdfDownloadUrl(fname)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#64748B] hover:text-[#0022FF] p-1.5 shrink-0"
                            title="Inspect PDF in new tab"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Privacy & Execution Settings */}
          <div className="pt-4 border-t border-[#D9D9D9] space-y-3">
            <div className="p-3 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#0022FF] shrink-0 mt-0.5" />
              <div className="text-xs font-mono text-[#475569] space-y-0.5">
                <strong className="text-[#0A0A0A]">Local PII Privacy Boundary:</strong>
                <p>
                  Claim documents are parsed entirely on this machine. Patient names, UHIDs, and direct
                  identifiers are masked into a local per-claim token vault ([PATIENT_NAME_1]) before any
                  outbound reasoning.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-mono text-[#64748B] cursor-pointer">
              <input
                type="checkbox"
                checked={forceFallback}
                onChange={(e) => setForceFallback(e.target.checked)}
                className="rounded-xs border-[#D9D9D9] text-[#0022FF]"
              />
              Force deterministic local regex & SQLite mode (skip cloud Gemini API even if key is set)
            </label>
          </div>

          {/* Section 4: Action Footer */}
          <div className="pt-4 border-t border-[#D9D9D9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs font-mono text-[#64748B]">
              Ready to process {totalStagedCount} hospital PDF(s) under {insurer} ({policyCode}).
            </div>

            <button
              type="submit"
              disabled={totalStagedCount === 0}
              className="px-8 py-4 rounded-full bg-[#0022FF] hover:bg-[#0044FF] disabled:bg-[#CBD5E1] text-white font-mono text-xs sm:text-sm font-bold tracking-wider flex items-center justify-center gap-3 transition-all shadow-md cursor-pointer group"
            >
              <span>PROCESS & EXTRACT DOCUMENTS ({totalStagedCount})</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
