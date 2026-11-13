import React, { useState } from "react";
import {
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Layers,
  ArrowRight,
} from "lucide-react";
import { AppState, PageView, ExtractedDoc } from "../types/claim";
import { getSamplePdfDownloadUrl } from "../services/api";

interface DocumentsPageProps {
  appState: AppState;
  onNavigate: (view: PageView) => void;
  onRemoveDocument: (docId: string) => Promise<void>;
}

export const DocumentsPage: React.FC<DocumentsPageProps> = ({
  appState,
  onNavigate,
  onRemoveDocument,
}) => {
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<ExtractedDoc | null>(
    appState.documents[0] || null
  );

  const docs = appState.documents || [];

  const filteredDocs = docs.filter((d) =>
    d.filename.toLowerCase().includes(search.toLowerCase()) ||
    d.document_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-[1360px] mx-auto p-6 md:p-8 space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9D9D9]">
        <div className="space-y-1">
          <div className="text-xs font-mono font-bold text-[#64748B] uppercase tracking-widest">
            DIGITAL ASSET ARCHIVE
          </div>
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[#0A0A0A] tracking-tight">
            Claim Document Registry ({docs.length})
          </h1>
          <p className="text-xs text-[#64748B]">
            All PDF files ingested, classified, and indexed with page and line coordinates for claim {appState.active_claim?.claim_id || "active claim"}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("new-claim")}
          className="px-4 py-2 bg-[#0A0A0A] hover:bg-[#0022FF] text-white font-mono text-xs font-bold rounded-xs transition-colors shrink-0"
        >
          + Upload More Documents
        </button>
      </div>

      {/* Main Grid: Document List on Left (7 cols), Selected Doc Detail on Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="relative font-mono text-xs">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search uploaded documents by name or type..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#D9D9D9] rounded-xs text-[#0A0A0A] focus:outline-none focus:border-[#0022FF]"
            />
          </div>

          <div className="space-y-2.5">
            {filteredDocs.length === 0 ? (
              <div className="p-8 bg-white border-2 border-dashed border-[#D9D9D9] text-center text-xs font-mono text-[#64748B]">
                No documents uploaded for this claim.
              </div>
            ) : (
              filteredDocs.map((doc) => {
                const isSelected = selectedDoc?.doc_id === doc.doc_id;
                return (
                  <div
                    key={doc.doc_id}
                    onClick={() => setSelectedDoc(doc)}
                    className={`p-4 border-2 rounded-xs cursor-pointer transition-all flex items-start justify-between gap-3 ${
                      isSelected
                        ? "border-[#0022FF] bg-[#F0F3FF]"
                        : "border-[#D9D9D9] bg-white hover:border-[#0A0A0A]"
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#0022FF] shrink-0" />
                        <span className="font-mono text-xs font-bold text-[#0A0A0A] truncate">
                          {doc.filename}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-[#475569]">
                        Detected: <strong className="text-[#0A0A0A]">{doc.document_type}</strong>
                        {doc.document_subtype ? ` (${doc.document_subtype})` : ""} · Mode: {doc.processing_mode}
                      </div>
                      <div className="text-[10px] font-mono text-[#64748B]">
                        Pages: {doc.page_count} · Confidence: {Math.round(doc.confidence * 100)}%
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveDocument(doc.doc_id);
                        }}
                        className="p-1.5 text-[#64748B] hover:text-[#D93636] rounded-xs"
                        title="Remove document from claim"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Selected Document Provenance View */}
        <div className="lg:col-span-5 space-y-4">
          {selectedDoc ? (
            <div className="bg-white border-2 border-[#0A0A0A] p-6 rounded-xs space-y-4 shadow-sm font-mono text-xs">
              <div className="flex items-start justify-between border-b border-[#D9D9D9] pb-3">
                <div>
                  <span className="text-[10px] text-[#64748B] uppercase block">DOCUMENT INSPECTION</span>
                  <h3 className="font-heading font-bold text-base text-[#0A0A0A] break-all">
                    {selectedDoc.filename}
                  </h3>
                </div>
                <a
                  href={getSamplePdfDownloadUrl(selectedDoc.filename)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-[#F5F5F5] hover:bg-[#F0F3FF] border border-[#D9D9D9] text-[#0022FF] text-[11px] font-bold rounded-xs flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  View PDF
                </a>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Document Type:</span>
                  <span className="font-bold text-[#0A0A0A]">{selectedDoc.document_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Processing Engine:</span>
                  <span className="font-bold text-[#0A0A0A]">{selectedDoc.processing_mode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Classification Confidence:</span>
                  <span className="font-bold text-[#16834A]">{Math.round(selectedDoc.confidence * 100)}%</span>
                </div>
              </div>

              {/* Extracted Fields Table */}
              <div className="pt-2 border-t border-[#D9D9D9] space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] block">
                  Extracted Structured Fields ({Object.keys(selectedDoc.extracted_fields).length})
                </span>

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {Object.entries(selectedDoc.extracted_fields).map(([fname, pf]) => (
                    <div key={fname} className="p-2.5 bg-[#F5F5F5] border border-[#D9D9D9] rounded-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[#0A0A0A]">{fname}</span>
                        <span className="text-[10px] text-[#64748B]">
                          p.{pf.page} L.{pf.line}
                        </span>
                      </div>
                      <div className="font-bold text-[#0022FF] break-words">
                        {pf.value || <span className="text-[#94A3B8]">null</span>}
                      </div>
                      {pf.excerpt && (
                        <div className="text-[10px] text-[#64748B] truncate">
                          &quot;{pf.excerpt}&quot;
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 bg-[#F5F5F5] border-2 border-dashed border-[#D9D9D9] text-center text-xs font-mono text-[#64748B]">
              Select a document to inspect its extracted provenance.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
