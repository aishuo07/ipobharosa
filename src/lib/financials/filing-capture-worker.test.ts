import { describe, expect, it } from "vitest";
import {
  buildFilingCaptureCandidates,
  selectReadyFilingCandidate,
  type FilingWorkerIpo,
} from "./filing-capture-worker";

const ipo = (overrides: Partial<FilingWorkerIpo> = {}): FilingWorkerIpo => ({
  id: "ipo-1",
  company: { name: "Example Limited" },
  rhpUrl: "https://www.sebi.gov.in/filings/example-rhp.pdf",
  drhpUrl: "https://www.sebi.gov.in/filings/example-drhp.pdf",
  financialDocuments: [],
  ...overrides,
});

describe("filing capture worker selection", () => {
  it("prefers RHP, retains DRHP as a second immutable document, and skips captures that already exist", () => {
    const [rhp, drhp] = buildFilingCaptureCandidates([ipo()]);
    expect([rhp.documentType, drhp.documentType]).toEqual(["RHP", "DRHP"]);

    const remaining = buildFilingCaptureCandidates([ipo({
      financialDocuments: [{ documentType: "RHP", sourceUrl: "https://www.sebi.gov.in/filings/example-rhp.pdf" }],
    })]);
    expect(remaining.map((candidate) => candidate.documentType)).toEqual(["DRHP"]);
  });

  it("never queues a third-party filing copy", () => {
    expect(buildFilingCaptureCandidates([ipo({
      rhpUrl: "https://ipowatch.in/files/example-rhp.pdf",
      drhpUrl: null,
    })])).toEqual([]);
  });

  it("skips candidates in persisted backoff without blocking other documents", () => {
    const candidates = buildFilingCaptureCandidates([ipo()]);
    const now = new Date("2026-08-15T00:00:00.000Z");
    const selection = selectReadyFilingCandidate(candidates, [
      { key: candidates[0].key, nextRetryAt: new Date("2026-08-15T01:00:00.000Z") },
    ], now);
    expect(selection.candidate?.documentType).toBe("DRHP");
    expect(selection).toMatchObject({ ready: 1, waitingForRetry: 1 });
  });

  it("makes a failed candidate eligible again after its retry time", () => {
    const candidates = buildFilingCaptureCandidates([ipo({ drhpUrl: null })]);
    const selection = selectReadyFilingCandidate(candidates, [
      { key: candidates[0].key, nextRetryAt: new Date("2026-08-15T01:00:00.000Z") },
    ], new Date("2026-08-15T02:00:00.000Z"));
    expect(selection.candidate).toEqual(candidates[0]);
    expect(selection.waitingForRetry).toBe(0);
  });
});
