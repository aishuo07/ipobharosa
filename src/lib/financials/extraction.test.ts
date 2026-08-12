import { describe, it, expect } from "vitest";
import { parseNumber, normalizeToCrores, normalize, validate, compareToExisting } from "./extraction";
import type { RawExtraction } from "./extraction";

describe("Financial Extraction", () => {
  describe("parseNumber", () => {
    it("parses simple number", () => {
      const { value, unit } = parseNumber("3,449.96");
      expect(value).toBe(3449.96);
      expect(unit).toBe("actual");
    });

    it("parses rupee symbol with crore", () => {
      const { value, unit } = parseNumber("₹3,449.96");
      expect(value).toBe(3449.96);
      expect(unit).toBe("Cr");
    });

    it("parses millions", () => {
      const { value, unit } = parseNumber("₹3,449.96 million");
      expect(value).toBe(3449.96);
      expect(unit).toBe("Mn");
    });

    it("parses negative numbers in parentheses", () => {
      const { value } = parseNumber("(595.18)");
      expect(value).toBe(-595.18);
    });

    it("detects currency as INR", () => {
      const { currency } = parseNumber("₹100");
      expect(currency).toBe("INR");
    });
  });

  describe("normalizeToCrores", () => {
    it("keeps crores as-is", () => {
      expect(normalizeToCrores(100, "Cr")).toBe(100);
      expect(normalizeToCrores(100, "crore")).toBe(100);
    });

    it("converts millions to crores", () => {
      expect(normalizeToCrores(1000, "Mn")).toBe(100);
      expect(normalizeToCrores(1000, "million")).toBe(100);
    });

    it("assumes actual unit is crores", () => {
      expect(normalizeToCrores(344.996, "actual")).toBe(344.996);
    });

    it("throws on unknown unit", () => {
      expect(() => normalizeToCrores(100, "unknown")).toThrow();
    });
  });

  describe("normalize", () => {
    it("normalizes RHP-style revenue figure", () => {
      const raw: RawExtraction = {
        metric: "REVENUE" as any,
        originalLabel: "Revenue from Operations (Net)",
        rawValue: "₹3,449.96",
        fiscalYear: "31 Mar 2026",
        scope: "Consolidated",
        auditStatus: "Audited",
        pageNumber: 1,
        tableReference: "Table 5.1",
        ocrUsed: false,
        extractionConfidence: 1.0,
      };

      const norm = normalize(raw);
      expect(norm.normalizedValue).toBe(3449.96);
      expect(norm.unit).toBe("Cr");
      expect(norm.currency).toBe("INR");
    });

    it("normalizes from millions", () => {
      const raw: RawExtraction = {
        metric: "REVENUE" as any,
        originalLabel: "Revenue from Operations",
        rawValue: "₹3,449.96 million",
        fiscalYear: "31 Mar 2026",
        scope: "Consolidated",
        auditStatus: "Audited",
        pageNumber: 1,
        tableReference: "Table 5.1",
        ocrUsed: false,
        extractionConfidence: 1.0,
      };

      const norm = normalize(raw);
      expect(norm.normalizedValue).toBeCloseTo(344.996, 2); // ÷10
    });
  });

  describe("validate", () => {
    it("passes high-confidence extraction", () => {
      const norm = {
        metric: "REVENUE" as any,
        originalLabel: "Revenue",
        rawValue: "₹3,449.96",
        normalizedValue: 3449.96,
        currency: "INR",
        unit: "Cr",
        fiscalYear: "31 Mar 2026",
        scope: "Consolidated" as const,
        auditStatus: "Audited" as const,
        pageNumber: 1,
        tableReference: "Table 5.1",
        ocrUsed: false,
        extractionConfidence: 1.0,
      };

      const validated = validate(norm);
      expect(validated.validationPass).toBe(true);
      expect(validated.severity).toBe("HIGH_CONFIDENCE");
      expect(validated.validationIssues).toHaveLength(0);
    });

    it("flags low extraction confidence", () => {
      const norm = {
        metric: "REVENUE" as any,
        originalLabel: "Revenue",
        rawValue: "₹3,449.96",
        normalizedValue: 3449.96,
        currency: "INR",
        unit: "Cr",
        fiscalYear: "31 Mar 2026",
        scope: "Consolidated" as const,
        auditStatus: "Audited" as const,
        pageNumber: 1,
        tableReference: "Table 5.1",
        ocrUsed: true,
        ocrConfidence: 0.5,
        extractionConfidence: 0.5,
      };

      const validated = validate(norm);
      expect(validated.severity).toBe("REVIEW_REQUIRED");
      expect(validated.validationIssues.length).toBeGreaterThan(0);
    });

    it("flags extreme values", () => {
      const norm = {
        metric: "REVENUE" as any,
        originalLabel: "Revenue",
        rawValue: "999,999,999",
        normalizedValue: 999_999_999,
        currency: "INR",
        unit: "Cr",
        fiscalYear: "31 Mar 2026",
        scope: "Consolidated" as const,
        auditStatus: "Audited" as const,
        pageNumber: 1,
        tableReference: "Table 5.1",
        ocrUsed: false,
        extractionConfidence: 1.0,
      };

      const validated = validate(norm);
      expect(validated.severity).toBe("REVIEW_REQUIRED");
      expect(validated.validationIssues.some((i) => i.includes("Extreme"))).toBe(true);
    });

    it("flags invalid fiscal year", () => {
      const norm = {
        metric: "REVENUE" as any,
        originalLabel: "Revenue",
        rawValue: "₹3,449.96",
        normalizedValue: 3449.96,
        currency: "INR",
        unit: "Cr",
        fiscalYear: "", // invalid
        scope: "Consolidated" as const,
        auditStatus: "Audited" as const,
        pageNumber: 1,
        tableReference: "Table 5.1",
        ocrUsed: false,
        extractionConfidence: 1.0,
      };

      const validated = validate(norm);
      expect(validated.severity).toBe("REVIEW_REQUIRED");
      expect(validated.validationIssues.some((i) => i.includes("fiscal year"))).toBe(true);
    });
  });

  describe("compareToExisting", () => {
    it("reports no mismatch when values match within tolerance", () => {
      const { mismatch, percent } = compareToExisting(100, 100.25);
      expect(mismatch).toBe(false);
      expect(percent).toBeLessThan(1);
    });

    it("reports mismatch when values differ >0.5%", () => {
      const { mismatch, percent } = compareToExisting(100, 105);
      expect(mismatch).toBe(true);
      expect(percent).toBeGreaterThan(4.5);
    });

    it("returns null percent when no existing value", () => {
      const { mismatch, percent } = compareToExisting(100, null);
      expect(mismatch).toBe(false);
      expect(percent).toBe(null);
    });

    it("handles zero existing value", () => {
      const { mismatch } = compareToExisting(100, 0);
      expect(mismatch).toBe(true);
    });
  });
});
