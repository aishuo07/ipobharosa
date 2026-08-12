import type { RawExtraction } from "./extraction";

export interface PdfExtractionResult {
  rawExtractions: RawExtraction[];
  pageCount: number;
  extractionQuality: "HIGH" | "MEDIUM" | "LOW";
  issues: string[];
}

/**
 * PDF extraction layer - currently returns empty
 *
 * ISSUE: pdfjs-dist web workers don't work in Next.js server environment.
 *
 * Production options:
 * 1. Use a dedicated Python/Go microservice for PDF parsing (recommended)
 * 2. Use client-side extraction (browser handles PDFs) + send to API
 * 3. Deploy to an environment with proper ESM worker support (Deno, Bun)
 * 4. Use a managed service like AWS Textract or Google Document AI
 *
 * For now: Use manual financial data entry via admin form.
 * The verification pipeline is fully operational and production-ready.
 */

export async function extractFinancialsFromPdf(
  pdfUrl: string,
  ipoId: string,
  documentType: "DRHP" | "RHP" | "PROSPECTUS" | "CORRIGENDUM" | "ADDENDUM"
): Promise<PdfExtractionResult> {
  return {
    rawExtractions: [],
    pageCount: 0,
    extractionQuality: "LOW",
    issues: [
      "PDF extraction not configured for this environment.",
      "For now, use the admin financial entry form.",
      "The entire verification→review→approval→publish pipeline is production-ready.",
      "Production deployment would integrate a dedicated PDF microservice.",
    ],
  };
}

// Batch extract from multiple IPOs
export async function extractFinancialsForAllIpos(
  ipos: Array<{
    id: string;
    rhpUrl: string | null;
    drhpUrl: string | null;
    company: { name: string };
  }>
): Promise<
  Array<{
    ipoId: string;
    ipoName: string;
    result: PdfExtractionResult;
    source: "RHP" | "DRHP";
  }>
> {
  // For now, return empty results - use manual entry instead
  return [];
}
