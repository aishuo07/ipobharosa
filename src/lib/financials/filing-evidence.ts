import { createHash } from "node:crypto";
import { filingEvidenceClass } from "@/lib/document-evidence";
import { withTransientRetries } from "@/lib/ingestion/source-operation";
import { syncDocument } from "./workflow";
import { ipobharosaUserAgent } from "@/lib/site-url";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
// The route has a 60-second hard ceiling. Two bounded attempts leave enough
// time for response validation, persistence, and guaranteed lock release.
const FETCH_TIMEOUT_MS = 20_000;

export type FilingCapture = {
  sha256: string;
  byteLength: number;
  contentType: string;
};

export async function downloadFilingEvidence(sourceUrl: string): Promise<FilingCapture> {
  if (filingEvidenceClass(sourceUrl) === "THIRD_PARTY") {
    throw new Error("third-party filing copies are not accepted as immutable verification evidence");
  }
  const response = await withTransientRetries(async () => {
    const result = await fetch(sourceUrl, {
      headers: { "User-Agent": ipobharosaUserAgent() },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!result.ok) throw new Error(`filing download: HTTP ${result.status}`);
    return result;
  }, { maxAttempts: 2 });
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PDF_BYTES) throw new Error(`filing exceeds ${MAX_PDF_BYTES} byte safety limit`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error(`filing exceeds ${MAX_PDF_BYTES} byte safety limit`);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("filing response is not a PDF");
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
    contentType: response.headers.get("content-type") ?? "application/pdf",
  };
}

export async function captureFilingEvidence(
  ipoId: string,
  documentType: "DRHP" | "RHP",
  sourceUrl: string,
) {
  const capture = await downloadFilingEvidence(sourceUrl);
  const documentId = await syncDocument(ipoId, documentType, sourceUrl, capture.sha256, null);
  return { documentId, ...capture };
}
