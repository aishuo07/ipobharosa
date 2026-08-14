import { describe, expect, it, vi } from "vitest";
import { officialIncidentFingerprint, persistOfficialIncident } from "./persistence";
import type { PublicationDecision } from "./types";

function decision(order: "normal" | "reversed" = "normal"): PublicationDecision {
  const comparisons: PublicationDecision["comparisons"] = [
    { field: "lotSize", status: "CONFLICT", candidateValue: 100, officialValue: 200, sourceUrl: "https://www.nseindia.com/a" },
    { field: "openDate", status: "CONFLICT", candidateValue: "2026-08-01", officialValue: "2026-08-02", sourceUrl: "https://www.nseindia.com/a" },
  ];
  return {
    decision: "EXCEPTION",
    reasons: ["material facts differ"],
    comparisons: order === "normal" ? comparisons : [...comparisons].reverse(),
    evidence: {
      source: "NSE",
      sourceUrl: "https://www.nseindia.com/a",
      capturedAt: new Date("2026-08-14T00:00:00Z"),
      facts: {
        companyName: "Example Ltd",
        board: "MAINBOARD",
        priceBandLow: 1,
        priceBandHigh: 2,
        lotSize: 200,
        openDate: new Date("2026-08-02T00:00:00Z"),
        closeDate: new Date("2026-08-03T00:00:00Z"),
        registrar: "Registrar",
        leadManagers: ["Manager"],
        rhpUrl: "https://nsearchives.nseindia.com/rhp.pdf",
      },
      fieldSources: {},
      raw: {},
    },
  };
}

describe("official incident persistence", () => {
  it("produces the same fingerprint regardless of comparison order", () => {
    expect(officialIncidentFingerprint("ipo-1", "CONFLICT", decision("normal")))
      .toBe(officialIncidentFingerprint("ipo-1", "CONFLICT", decision("reversed")));
  });

  it("upserts one incident and increments repeated occurrences", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const tx = { officialEvidenceIncident: { upsert } };

    await persistOfficialIncident(tx as never, "ipo-1", "CONFLICT", decision());

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ ipoId: "ipo-1", kind: "CONFLICT", fields: ["lotSize", "openDate"] }),
      update: expect.objectContaining({ occurrenceCount: { increment: 1 } }),
    }));
  });
});
