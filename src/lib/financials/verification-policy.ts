import { filingEvidenceClass } from "@/lib/document-evidence";

export type FinancialVerificationState = "AUTO_VERIFIED" | "REVIEW_REQUIRED";

export type FinancialVerificationReason =
  | "SOURCE_NOT_OFFICIAL"
  | "NON_FINAL_DOCUMENT"
  | "SUPERSEDED_DOCUMENT"
  | "OCR_USED"
  | "LOW_CONFIDENCE"
  | "VALIDATION_FAILED"
  | `VALIDATION_ISSUE:${string}`
  | "MISSING_FISCAL_YEAR"
  | "MISSING_SCOPE"
  | "MISSING_AUDIT_STATUS"
  | "MISSING_PAGE"
  | "MISSING_TABLE_REFERENCE"
  | "MISSING_VALUE"
  | "EXISTING_PUBLISHED_VALUE"
  | "PUBLISHED_VALUE_MISMATCH"
  | "DUPLICATE_DISAGREEMENT";

export type FinancialCandidateEvidence = {
  sourceUrl: string;
  documentType: string;
  isLatestEvidence: boolean;
  extractionConfidence: number;
  ocrUsed: boolean;
  validationPass: boolean;
  validationIssues: string[];
  fiscalYear: string;
  scope: string;
  auditStatus: string;
  pageNumber: number | null;
  tableReference: string | null;
  normalizedValue: number | null;
  mismatchPercent: number | null;
  hasExistingPublished: boolean;
  duplicateValues: number[];
};

export type FinancialVerificationDecision = {
  state: FinancialVerificationState;
  reasons: FinancialVerificationReason[];
};

const SAFE_DOCUMENT_TYPES = new Set(["DRHP", "RHP", "PROSPECTUS"]);
const SAFE_SCOPES = new Set(["Consolidated", "Standalone"]);
const SAFE_AUDIT_STATUSES = new Set(["Audited", "Restated"]);
const MIN_EXTRACTION_CONFIDENCE = 0.9;
const VALUE_TOLERANCE_PERCENT = 0.5;

function duplicateValuesDisagree(values: number[]): boolean {
  if (values.length < 2) return false;
  const nonZero = values.filter((value) => Number.isFinite(value));
  if (nonZero.length !== values.length) return true;
  const min = Math.min(...nonZero);
  const max = Math.max(...nonZero);
  if (min === max) return false;
  if (min === 0) return true;
  return (Math.abs(max - min) / Math.abs(min)) * 100 > VALUE_TOLERANCE_PERCENT;
}

/**
 * Classifies whether a financial extraction may enter an atomic safe batch.
 * AUTO_VERIFIED means deterministic checks passed; it is not published until
 * an authenticated admin publishes the filing batch.
 */
export function classifyFinancialCandidate(candidate: FinancialCandidateEvidence): FinancialVerificationDecision {
  const reasons: FinancialVerificationReason[] = [];

  if (filingEvidenceClass(candidate.sourceUrl) !== "OFFICIAL") reasons.push("SOURCE_NOT_OFFICIAL");
  if (!SAFE_DOCUMENT_TYPES.has(candidate.documentType)) reasons.push("NON_FINAL_DOCUMENT");
  if (!candidate.isLatestEvidence) reasons.push("SUPERSEDED_DOCUMENT");
  if (candidate.ocrUsed) reasons.push("OCR_USED");
  if (candidate.extractionConfidence < MIN_EXTRACTION_CONFIDENCE) reasons.push("LOW_CONFIDENCE");
  if (!candidate.validationPass) reasons.push("VALIDATION_FAILED");
  for (const issue of candidate.validationIssues) reasons.push(`VALIDATION_ISSUE:${issue}`);
  if (!candidate.fiscalYear.trim()) reasons.push("MISSING_FISCAL_YEAR");
  if (!SAFE_SCOPES.has(candidate.scope)) reasons.push("MISSING_SCOPE");
  if (!SAFE_AUDIT_STATUSES.has(candidate.auditStatus)) reasons.push("MISSING_AUDIT_STATUS");
  if (!candidate.pageNumber || candidate.pageNumber < 1) reasons.push("MISSING_PAGE");
  if (!candidate.tableReference?.trim()) reasons.push("MISSING_TABLE_REFERENCE");
  if (candidate.normalizedValue === null || !Number.isFinite(candidate.normalizedValue)) reasons.push("MISSING_VALUE");
  if (candidate.hasExistingPublished) reasons.push("EXISTING_PUBLISHED_VALUE");
  if (candidate.mismatchPercent !== null && candidate.mismatchPercent > VALUE_TOLERANCE_PERCENT) reasons.push("PUBLISHED_VALUE_MISMATCH");
  if (duplicateValuesDisagree(candidate.duplicateValues)) reasons.push("DUPLICATE_DISAGREEMENT");

  return reasons.length === 0 ? { state: "AUTO_VERIFIED", reasons } : { state: "REVIEW_REQUIRED", reasons };
}
