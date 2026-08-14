import { describe, expect, it, vi } from "vitest";
import { officialIncidentFingerprint, persistOfficialDecision, persistOfficialIncident } from "./persistence";
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

describe("multi-source evidence persistence", () => {
  it("retains every provider attempt and one append-only capture per found provider", async () => {
    const value = decision();
    const bse = { ...value.evidence!, source: "BSE" as const, sourceUrl: "https://api.bseindia.com/detail" };
    value.evidences = [value.evidence!, bse];
    value.attempts = [
      { source: "NSE", status: "FOUND", reason: null, issueType: "IPO", sourceUrl: value.evidence!.sourceUrl },
      { source: "BSE", status: "FOUND", reason: null, issueType: "IPO", sourceUrl: bse.sourceUrl },
    ];
    value.comparisons = value.comparisons.flatMap((comparison) => [
      { ...comparison, source: "NSE" as const },
      { ...comparison, source: "BSE" as const, sourceUrl: bse.sourceUrl },
    ]);
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const create = vi.fn().mockResolvedValue({});
    const tx = { officialSourceAttempt: { createMany }, officialEvidenceCapture: { create } };

    await persistOfficialDecision(tx as never, "ipo-1", value);

    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ source: "NSE" }), expect.objectContaining({ source: "BSE" })]) }));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: "BSE", normalized: expect.any(Object) }) }));
  });
});
