import { describe, expect, it } from "vitest";
import { validateIpoFacts } from "./validate";
import type { IpoFacts } from "./types";

function makeFacts(overrides: Partial<IpoFacts> = {}): IpoFacts {
  return {
    companyName: "Test Co Ltd",
    board: "MAINBOARD",
    priceBandLow: 100,
    priceBandHigh: 110,
    lotSize: 130,
    issueSizeCr: 500,
    freshIssueCr: 400,
    ofsCr: 100,
    openDate: new Date("2026-08-18"),
    closeDate: new Date("2026-08-20"),
    allotmentDate: new Date("2026-08-21"),
    refundDate: new Date("2026-08-24"),
    listingDate: new Date("2026-08-25"),
    registrar: "Kfin Technologies Ltd.",
    leadManagers: ["Some Bank Ltd"],
    drhpUrl: "https://example.com/drhp.pdf",
    rhpUrl: null,
    ...overrides,
  };
}

describe("validateIpoFacts", () => {
  it("returns no problems for a fully valid candidate", () => {
    expect(validateIpoFacts(makeFacts())).toEqual([]);
  });

  it("flags an inverted price band", () => {
    const problems = validateIpoFacts(makeFacts({ priceBandLow: 110, priceBandHigh: 100 }));
    expect(problems.some((p) => p.includes("price band low"))).toBe(true);
  });

  it("flags a non-positive price band", () => {
    const problems = validateIpoFacts(makeFacts({ priceBandLow: 0, priceBandHigh: 100 }));
    expect(problems.some((p) => p.includes("positive"))).toBe(true);
  });

  it("flags a non-integer or non-positive lot size", () => {
    expect(validateIpoFacts(makeFacts({ lotSize: 0 })).some((p) => p.includes("lot size"))).toBe(true);
    expect(validateIpoFacts(makeFacts({ lotSize: 12.5 })).some((p) => p.includes("lot size"))).toBe(true);
  });

  it("flags a non-positive issue size", () => {
    expect(validateIpoFacts(makeFacts({ issueSizeCr: 0 })).some((p) => p.includes("issue size"))).toBe(true);
  });

  it("flags a missing registrar", () => {
    expect(validateIpoFacts(makeFacts({ registrar: "  " })).some((p) => p.includes("registrar"))).toBe(true);
  });

  it("flags no lead managers", () => {
    expect(validateIpoFacts(makeFacts({ leadManagers: [] })).some((p) => p.includes("lead managers"))).toBe(true);
  });

  it("flags open date not strictly before close date", () => {
    const problems = validateIpoFacts(makeFacts({ openDate: new Date("2026-08-20"), closeDate: new Date("2026-08-20") }));
    expect(problems.some((p) => p.includes("open date"))).toBe(true);
  });

  it("flags an out-of-order lifecycle date (allotment before close)", () => {
    const problems = validateIpoFacts(makeFacts({ allotmentDate: new Date("2026-08-19") }));
    expect(problems.some((p) => p.includes("allotment date"))).toBe(true);
  });

  it("flags an out-of-order lifecycle date (listing before refund)", () => {
    const problems = validateIpoFacts(makeFacts({ listingDate: new Date("2026-08-22") }));
    expect(problems.some((p) => p.includes("refund date"))).toBe(true);
  });

  it("allows same-day allotment/refund/listing (common in fast SME schemes)", () => {
    const sameDay = new Date("2026-08-21");
    const problems = validateIpoFacts(makeFacts({ allotmentDate: sameDay, refundDate: sameDay, listingDate: sameDay }));
    expect(problems).toEqual([]);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const problems = validateIpoFacts(
      makeFacts({ priceBandLow: 0, priceBandHigh: 0, lotSize: 0, issueSizeCr: 0, registrar: "", leadManagers: [] }),
    );
    expect(problems.length).toBeGreaterThanOrEqual(5);
  });
});
