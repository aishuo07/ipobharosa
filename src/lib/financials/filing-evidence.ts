import { createHash } from "node:crypto";
import { unzip } from "fflate";
import { filingEvidenceClass } from "@/lib/document-evidence";
import { withTransientRetries } from "@/lib/ingestion/source-operation";
import { syncDocument } from "./workflow";
import { ipobharosaUserAgent } from "@/lib/site-url";

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 100;
const MAX_TOTAL_PDF_BYTES = 75 * 1024 * 1024;
// The route has a 60-second hard ceiling. Two bounded attempts leave enough
// time for response validation, persistence, and guaranteed lock release.
const FETCH_TIMEOUT_MS = 20_000;

export type FilingCapture = {
  sha256: string;
  byteLength: number;
  contentType: "application/pdf";
  sourceFormat: "PDF" | "ZIP";
  archiveEntry?: string;
};

type FilingDocumentType = "DRHP" | "RHP";

function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
}

function isZip(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const signature = Buffer.from(bytes.subarray(0, 4)).toString("hex");
  return ["504b0304", "504b0506", "504b0708"].includes(signature);
}

function filingNameScore(name: string, documentType: FilingDocumentType): number {
  const words = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
  const joined = words.join(" ");
  if (documentType === "DRHP") {
    if (words.includes("drhp")) return 3;
    if (joined.includes("draft red herring prospectus")) return 2;
    return 0;
  }
  if (words.includes("rhp") && !words.includes("drhp")) return 3;
  if (joined.includes("red herring prospectus") && !joined.includes("draft red herring prospectus")) return 2;
  return 0;
}

export function selectFilingPdfEntry(
  files: Record<string, Uint8Array>,
  documentType: FilingDocumentType,
): { name: string; bytes: Uint8Array } {
  const pdfs = Object.entries(files)
    .filter(([name, bytes]) => name.toLowerCase().endsWith(".pdf") && isPdf(bytes))
    .map(([name, bytes]) => ({ name, bytes, score: filingNameScore(name, documentType) }));
  if (pdfs.length === 0) throw new Error("official ZIP contains no valid PDF filing");
  const bestScore = Math.max(...pdfs.map((pdf) => pdf.score));
  const best = pdfs.filter((pdf) => pdf.score === bestScore);
  if (bestScore === 0 && pdfs.length === 1) return pdfs[0];
  if (bestScore === 0 || best.length !== 1) {
    throw new Error(`official ZIP has ambiguous ${documentType} PDF entries`);
  }
  return best[0];
}

async function extractFilingFromZip(
  archive: Uint8Array,
  documentType: FilingDocumentType,
): Promise<{ name: string; bytes: Uint8Array }> {
  let entryCount = 0;
  let declaredPdfBytes = 0;
  let oversizedPdf = false;
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(archive, {
      filter: (entry) => {
        entryCount += 1;
        if (entryCount > MAX_ZIP_ENTRIES) throw new Error(`official ZIP exceeds ${MAX_ZIP_ENTRIES} entry safety limit`);
        if (!entry.name.toLowerCase().endsWith(".pdf")) return false;
        if (entry.originalSize > MAX_PDF_BYTES) {
          oversizedPdf = true;
          return false;
        }
        declaredPdfBytes += entry.originalSize;
        if (declaredPdfBytes > MAX_TOTAL_PDF_BYTES) {
          throw new Error(`official ZIP PDFs exceed ${MAX_TOTAL_PDF_BYTES} expanded byte safety limit`);
        }
        return true;
      },
    }, (error, result) => error ? reject(error) : resolve(result));
  });
  if (oversizedPdf) throw new Error(`official ZIP contains a PDF over ${MAX_PDF_BYTES} byte safety limit`);
  const selected = selectFilingPdfEntry(files, documentType);
  if (selected.bytes.byteLength > MAX_PDF_BYTES) throw new Error(`filing exceeds ${MAX_PDF_BYTES} byte safety limit`);
  return selected;
}

export async function downloadFilingEvidence(
  sourceUrl: string,
  documentType: FilingDocumentType = "RHP",
): Promise<FilingCapture> {
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
  if (contentLength > MAX_DOWNLOAD_BYTES) throw new Error(`filing download exceeds ${MAX_DOWNLOAD_BYTES} byte safety limit`);
  const responseBytes = Buffer.from(await response.arrayBuffer());
  if (responseBytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error(`filing download exceeds ${MAX_DOWNLOAD_BYTES} byte safety limit`);
  let filingBytes: Uint8Array = responseBytes;
  let sourceFormat: FilingCapture["sourceFormat"] = "PDF";
  let archiveEntry: string | undefined;
  if (!isPdf(responseBytes)) {
    if (!isZip(responseBytes)) throw new Error("filing response is neither a PDF nor a ZIP archive");
    const extracted = await extractFilingFromZip(responseBytes, documentType);
    filingBytes = extracted.bytes;
    archiveEntry = extracted.name;
    sourceFormat = "ZIP";
  }
  return {
    sha256: createHash("sha256").update(filingBytes).digest("hex"),
    byteLength: filingBytes.byteLength,
    contentType: "application/pdf",
    sourceFormat,
    ...(archiveEntry ? { archiveEntry } : {}),
  };
}

export async function captureFilingEvidence(
  ipoId: string,
  documentType: "DRHP" | "RHP",
  sourceUrl: string,
) {
  const capture = await downloadFilingEvidence(sourceUrl, documentType);
  const documentId = await syncDocument(ipoId, documentType, sourceUrl, capture.sha256, null);
  return { documentId, ...capture };
}
