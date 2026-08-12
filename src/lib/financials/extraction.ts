import { FinancialMetric, ExtractionStatus } from "@/generated/prisma";

/**
 * Extractions from financial documents follow a strict audit trail:
 * raw PDF text → extract metric values → normalize units/scope →
 * validate rules → publish only if approved.
 *
 * This module handles: parsing, normalization, and validation.
 * It does NOT apply business logic like "auto-publish if high confidence".
 * That is the responsibility of the review workflow.
 */

export interface RawExtraction {
  metric: FinancialMetric;
  originalLabel: string; // exact text from PDF
  rawValue: string; // "₹3,449.96 million" or "3,449.96"
  fiscalYear: string; // "31 Mar 2026"
  scope: "Consolidated" | "Standalone";
  auditStatus: "Audited" | "Restated" | "Provisional";
  pageNumber: number;
  tableReference: string;
  ocrUsed: boolean;
  ocrConfidence?: number;
  extractionConfidence: number; // 0.0–1.0 (1.0 = native table, 0.5 = OCR)
}

export interface NormalizedExtraction extends RawExtraction {
  normalizedValue: number; // always in Crores
  currency: string; // "INR"
  unit: string; // "Cr"
}

export interface ValidatedExtraction extends NormalizedExtraction {
  validationPass: boolean;
  validationIssues: string[];
  severity: "HIGH_CONFIDENCE" | "REVIEW_REQUIRED" | "FAILED";
}

/**
 * Parse raw text from a PDF table cell into a number.
 * Handle: ₹3,449.96 million | 3,449.96 | ₹(1,234.5) | etc.
 */
export function parseNumber(text: string): { value: number; unit: string; currency: string } {
  const trimmed = text.trim();

  // Detect parentheses = negative
  const isNegative = trimmed.includes("(") && trimmed.includes(")");

  // Extract numeric part: remove currency, commas, parentheses but keep decimal point
  const numericPart = trimmed
    .replace(/[₹₽$£€]/g, "") // remove currency symbols
    .replace(/[()]/g, "") // remove parentheses
    .replace(/,/g, ""); // remove thousand separators

  let value = parseFloat(numericPart);
  if (isNaN(value)) value = 0;
  if (isNegative) value = -value;

  // Infer unit from context (check specific units first, then fall back to currency)
  let unit = "actual"; // default: raw number as-is

  if (trimmed.toLowerCase().includes("million") || trimmed.includes("Mn")) {
    unit = "Mn";
  } else if (trimmed.toLowerCase().includes("crore") || trimmed.includes("Cr")) {
    unit = "Cr";
  } else if (trimmed.includes("₹")) {
    // "₹3,449.96" without explicit unit usually means Crores in Indian RHPs
    unit = "Cr";
  }

  return { value, unit, currency: trimmed.includes("₹") ? "INR" : "INR" };
}

/**
 * Normalize to Crores (our canonical unit).
 */
export function normalizeToCrores(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case "cr":
    case "crore":
    case "crores":
      return value;
    case "mn":
    case "million":
      return value / 10; // 10 million = 1 crore
    case "actual":
      // Assume it's already in Crores if no unit given in Indian context
      return value;
    default:
      throw new Error(`Unknown unit: ${unit}`);
  }
}

/**
 * Normalize a raw extraction into a canonical form.
 */
export function normalize(raw: RawExtraction): NormalizedExtraction {
  const parsed = parseNumber(raw.rawValue);
  const normalizedValue = normalizeToCrores(parsed.value, parsed.unit);

  return {
    ...raw,
    normalizedValue,
    currency: parsed.currency,
    unit: "Cr",
  };
}

/**
 * Validate deterministic rules on a normalized extraction.
 * Does NOT compare against existing snapshots — that's a later step.
 */
export function validate(norm: NormalizedExtraction): ValidatedExtraction {
  const issues: string[] = [];

  // FY period sanity
  if (!norm.fiscalYear || norm.fiscalYear.length < 4) {
    issues.push(`Invalid fiscal year: "${norm.fiscalYear}"`);
  }

  // Normalized value sanity (realistic range for Indian company financials in Crores)
  // Even Reliance is ~10,000 Cr in revenue; allowing up to 100,000 Cr for safety
  if (norm.normalizedValue < -100_000 || norm.normalizedValue > 100_000) {
    issues.push(`Extreme value detected: ${norm.normalizedValue} Cr (possible unit error)`);
  }

  // OCR quality check
  if (norm.ocrUsed && (norm.ocrConfidence ?? 0) < 0.8) {
    issues.push(`Low OCR confidence: ${norm.ocrConfidence}`);
  }

  // Extraction confidence check
  if (norm.extractionConfidence < 0.7) {
    issues.push(`Low extraction confidence: ${norm.extractionConfidence}`);
  }

  // Determine severity
  let severity: "HIGH_CONFIDENCE" | "REVIEW_REQUIRED" | "FAILED" = "HIGH_CONFIDENCE";
  if (issues.length > 0) severity = "REVIEW_REQUIRED";
  if (norm.normalizedValue === 0 || norm.normalizedValue === null) severity = "FAILED";

  return {
    ...norm,
    validationPass: issues.length === 0,
    validationIssues: issues,
    severity,
  };
}

/**
 * Compare extracted value against an existing published value.
 * Returns mismatch percentage; null if no prior value.
 */
export function compareToExisting(extracted: number, existing: number | null): { mismatch: boolean; percent: number | null } {
  if (existing === null || existing === undefined) return { mismatch: false, percent: null };

  const percent = Math.abs((extracted - existing) / Math.max(Math.abs(existing), 1)) * 100;
  const tolerance = 0.5; // ±0.5%

  return {
    mismatch: percent > tolerance,
    percent,
  };
}
