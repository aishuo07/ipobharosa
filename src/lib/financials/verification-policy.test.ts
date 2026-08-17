import { describe, expect, it } from "vitest";
import { classifyFinancialCandidate } from "./verification-policy";

const safeCandidate = {
  sourceUrl: "https://www.nseindia.com/companies-listing/corporate-filings-offer-documents",
  documentType: "RHP",
  isLatestEvidence: true,
  extractionConfidence: 0.96,
  ocrUsed: false,
  validationPass: true,
  validationIssues: [] as string[],
  fiscalYear: "31 Mar 2026",
  scope: "Consolidated",
  auditStatus: "Restated",
  pageNumber: 112,
  tableReference: "Summary of restated financial information",
  normalizedValue: 123.45,
  mismatchPercent: null as number | null,
  hasExistingPublished: false,
  duplicateValues: [123.45],
};

describe("classifyFinancialCandidate", () => {
  it("marks complete native-text RHP evidence from an official host as batch-safe", () => {
    expect(classifyFinancialCandidate(safeCandidate)).toEqual({ state: "AUTO_VERIFIED", reasons: [] });
  });

  it.each([
    ["third-party filing", { sourceUrl: "https://ipowatch.in/example.pdf" }, "SOURCE_NOT_OFFICIAL"],
    ["non-primary filing", { documentType: "ADDENDUM" }, "NON_FINAL_DOCUMENT"],
    ["superseded filing", { isLatestEvidence: false }, "SUPERSEDED_DOCUMENT"],
    ["OCR", { ocrUsed: true }, "OCR_USED"],
    ["low confidence", { extractionConfidence: 0.89 }, "LOW_CONFIDENCE"],
    ["missing page", { pageNumber: null }, "MISSING_PAGE"],
    ["missing table", { tableReference: null }, "MISSING_TABLE_REFERENCE"],
    ["existing value", { hasExistingPublished: true }, "EXISTING_PUBLISHED_VALUE"],
    ["published mismatch", { mismatchPercent: 0.6 }, "PUBLISHED_VALUE_MISMATCH"],
  ])("routes %s to exception review", (_name, change, reason) => {
    const result = classifyFinancialCandidate({ ...safeCandidate, ...change });
    expect(result.state).toBe("REVIEW_REQUIRED");
    expect(result.reasons).toContain(reason);
  });

  it("routes disagreeing duplicate extractions to exception review", () => {
    const result = classifyFinancialCandidate({ ...safeCandidate, duplicateValues: [123.45, 130] });
    expect(result).toEqual({ state: "REVIEW_REQUIRED", reasons: ["DUPLICATE_DISAGREEMENT"] });
  });

  it("allows an official DRHP when no newer filing supersedes it", () => {
    const result = classifyFinancialCandidate({ ...safeCandidate, documentType: "DRHP" });
    expect(result).toEqual({ state: "AUTO_VERIFIED", reasons: [] });
  });

  it("allows agreeing duplicates within the rounding tolerance", () => {
    const result = classifyFinancialCandidate({ ...safeCandidate, duplicateValues: [123.45, 123.6] });
    expect(result).toEqual({ state: "AUTO_VERIFIED", reasons: [] });
  });

  it("preserves deterministic validation reasons", () => {
    const result = classifyFinancialCandidate({
      ...safeCandidate,
      validationPass: false,
      validationIssues: ["Missing fiscal year", "Extreme value"],
    });
    expect(result.reasons).toEqual(["VALIDATION_FAILED", "VALIDATION_ISSUE:Missing fiscal year", "VALIDATION_ISSUE:Extreme value"]);
  });
});
