import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST, parseFinancialSubmission } from "./route";

const validPayload = {
  ipoId: "ipo-development-only",
  document: {
    sourceUrl: "https://official.example/rhp.pdf",
    documentType: "RHP",
    sha256: "a".repeat(64),
    pageCount: 120,
  },
  extractions: [
    {
      metric: "REVENUE",
      originalLabel: "Revenue from operations",
      rawValue: "₹3,449.96 Cr",
      fiscalYear: "31 Mar 2026",
      scope: "Consolidated",
      auditStatus: "Restated",
      pageNumber: 217,
      tableReference: "Restated financial information, table 3",
      ocrUsed: false,
      extractionConfidence: 0.84,
    },
  ],
};

afterEach(() => {
  delete process.env.ENABLE_EXPERIMENTAL_FINANCIAL_SUBMISSION;
});

describe("financial extraction submission boundary", () => {
  it("accepts complete document evidence and explicit financial context", () => {
    expect(parseFinancialSubmission(validPayload)).toEqual(validPayload);
  });

  it.each([
    ["virtual document URL", { ...validPayload.document, sourceUrl: "extracted://fake" }],
    ["non-PDF hash", { ...validPayload.document, sha256: "fake" }],
    ["zero page count", { ...validPayload.document, pageCount: 0 }],
  ])("rejects %s", (_label, document) => {
    expect(parseFinancialSubmission({ ...validPayload, document })).toBeNull();
  });

  it.each([
    ["missing unit", { ...validPayload.extractions[0], rawValue: "₹3,449.96" }],
    ["guessed fiscal year", { ...validPayload.extractions[0], fiscalYear: "UNKNOWN" }],
    ["unknown scope", { ...validPayload.extractions[0], scope: "UNKNOWN" }],
    ["unknown audit state", { ...validPayload.extractions[0], auditStatus: "UNKNOWN" }],
  ])("rejects %s", (_label, extraction) => {
    expect(parseFinancialSubmission({ ...validPayload, extractions: [extraction] })).toBeNull();
  });

  it("fails closed before authentication when the experimental endpoint is disabled", async () => {
    const request = new NextRequest("https://preview.example/api/admin/submit-extracted-financials", {
      method: "POST",
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Experimental financial submission is disabled" });
  });
});
