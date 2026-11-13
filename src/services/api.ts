import { AppState } from "../types/claim";

export async function fetchAppState(claimId?: string): Promise<AppState> {
  const url = claimId ? `/api/state?claim_id=${encodeURIComponent(claimId)}` : "/api/state?claim_id=__NONE__";
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load workspace state (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || "Backend reported an error loading state.");
  }
  return json.data as AppState;
}

export async function executeAction(
  action: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; data?: AppState; error?: string; mock_response?: Record<string, unknown> }> {
  const res = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || `Action ${action} failed.`);
  }
  return json;
}

export function getSamplePdfDownloadUrl(filename: string): string {
  return `/api/sample-pdf/${encodeURIComponent(filename)}`;
}

export async function convertPdfFileToBase64(
  file: File
): Promise<{ filename: string; base64: string; sizeKb: number }> {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error(`File "${file.name}" is not a PDF. Only PDF files are supported.`);
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    filename: file.name,
    base64: btoa(binary),
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
  };
}
