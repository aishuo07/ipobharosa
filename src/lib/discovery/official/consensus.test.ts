import { describe, expect, it } from "vitest";
import type { IpoFacts } from "../types";
import { decidePublication } from "./consensus";
import type { OfficialIpoEvidence } from "./types";

const candidate: IpoFacts = {
  companyName: "Shiprocket Ltd",
  board: "MAINBOARD",
  priceBandLow: 92,
  priceBandHigh: 97,
  lotSize: 154,
  issueSizeCr: 1617.49,
  freshIssueCr: 885.5,
  ofsCr: 731.99,
  openDate: new Date("2026-08-12"),
  closeDate: new Date("2026-08-14"),
  allotmentDate: new Date("2026-08-17"),
  refundDate: new Date("2026-08-18"),
  listingDate: new Date("2026-08-19"),
  registrar: "KFin Technologies Ltd.",
  leadManagers: ["Axis Capital Ltd", "JM Financial Ltd"],
  drhpUrl: null,
  rhpUrl: null,
};

const evidence: OfficialIpoEvidence = {
  source: "NSE",
  sourceUrl: "https://www.nseindia.com/market-data/issue-information?series=EQ&symbol=SHIPROCKET&type=Active",
  capturedAt: new Date("2026-08-12T12:00:00Z"),
  raw: {},
  facts: {
    companyName: "Shiprocket Limited",
    board: "MAINBOARD",
    priceBandLow: 92,
    priceBandHigh: 97,
    lotSize: 154,
    openDate: new Date("2026-08-12"),
    closeDate: new Date("2026-08-14"),
    registrar: "KFin Technologies Limited",
    leadManagers: ["Axis Capital Limited", "JM Financial Limited"],
    rhpUrl: "https://nsearchives.nseindia.com/content/ipo/RHP_SHIPROCKET.zip",
  },
  fieldSources: {},
};

describe("authoritative publication consensus", () => {
  it("auto-publishes only when every material official field agrees", () => {
    const result = decidePublication(candidate, { status: "FOUND", evidence });
    expect(result.decision).toBe("AUTO_PUBLISH");
    expect(result.comparisons.every((comparison) => comparison.status === "MATCH")).toBe(true);
  });

  it("compares IPO lifecycle dates as Indian calendar dates", () => {
    const istMidnightCandidate = {
      ...candidate,
      openDate: new Date("2026-08-11T18:30:00.000Z"),
      closeDate: new Date("2026-08-13T18:30:00.000Z"),
    };

    const result = decidePublication(istMidnightCandidate, { status: "FOUND", evidence });

    expect(result.decision).toBe("AUTO_PUBLISH");
    expect(result.comparisons.find((comparison) => comparison.field === "openDate")?.status).toBe("MATCH");
    expect(result.comparisons.find((comparison) => comparison.field === "closeDate")?.status).toBe("MATCH");
  });

  it("accepts a unique official issuer qualifier omitted by the discovery source", () => {
    const result = decidePublication(
      { ...candidate, companyName: "Teja Engineering" },
      { status: "FOUND", evidence: { ...evidence, facts: { ...evidence.facts, companyName: "Teja Engineering Industries Limited" } } },
    );
    expect(result.comparisons.find((comparison) => comparison.field === "companyName")?.status).toBe("MATCH");
  });

  it("routes a real material conflict to the exception queue", () => {
    const result = decidePublication({ ...candidate, lotSize: 130 }, { status: "FOUND", evidence });
    expect(result.decision).toBe("EXCEPTION");
    expect(result.reasons).toContain("lotSize differs between discovery and NSE");
  });

  it("retries a temporarily unavailable official source", () => {
    expect(decidePublication(candidate, { status: "UNAVAILABLE", reason: "NSE HTTP 503" })).toEqual({
      decision: "RETRY",
      reasons: ["NSE HTTP 503"],
      comparisons: [],
      evidence: null,
    });
  });

  it("retries incomplete official data instead of asking a human to invent it", () => {
    const incomplete = { ...evidence, facts: { ...evidence.facts, lotSize: null } };
    const result = decidePublication(candidate, { status: "FOUND", evidence: incomplete });
    expect(result.decision).toBe("RETRY");
    expect(result.reasons).toContain("NSE is missing material field lotSize");
  });

  it("does not require sector for automatic publication", () => {
    expect(decidePublication(candidate, { status: "FOUND", evidence }).decision).toBe("AUTO_PUBLISH");
  });
});
