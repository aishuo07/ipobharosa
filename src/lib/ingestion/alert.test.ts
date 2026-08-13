import { describe, expect, it } from "vitest";
import { computeAlertReasons } from "./alert";
import type { IngestionSummary } from "./run-cycle";

function makeSummary(overrides: Partial<IngestionSummary> = {}): IngestionSummary {
  return {
    ipoCount: 5,
    gmp: { snapshotsWritten: 5, ipoWithNoData: 0 },
    subscription: { snapshotsWritten: 2, failed: 0 },
    perSource: {
      ipowatch: { success: 5, failure: 0 },
      sahi: { success: 4, failure: 1 },
      ipoji: { success: 5, failure: 0 },
    },
    statusTransitions: 0,
    reminders: { sent: 0, failed: 0, skipped: 0 },
    discovery: { candidatesSeen: 0, alreadyTracked: 0, autoPublished: 0, draftsCreated: 0, quarantined: 0, fetchFailed: [], dbErrors: [], queueCapped: false, deferredCandidates: 0 },
    catalogue: { seen: 0, stored: 0, linked: 0 },
    filings: { captured: 0, skipped: 0, failed: [] },
    ...overrides,
  };
}

describe("computeAlertReasons", () => {
  it("returns no reasons for a healthy run", () => {
    expect(computeAlertReasons(makeSummary())).toEqual([]);
  });

  it("flags a fully crashed discovery step", () => {
    const reasons = computeAlertReasons(makeSummary({ discovery: { error: "listing page HTTP 500" } }));
    expect(reasons.some((r) => r.includes("Discovery crashed"))).toBe(true);
  });

  it("flags discovery database write failures", () => {
    const reasons = computeAlertReasons(
      makeSummary({
        discovery: { candidatesSeen: 1, alreadyTracked: 0, autoPublished: 0, draftsCreated: 0, quarantined: 0, fetchFailed: [], dbErrors: [{ companyName: "X", error: "constraint violation" }], queueCapped: false, deferredCandidates: 0 },
      }),
    );
    expect(reasons.some((r) => r.includes("database write failure"))).toBe(true);
  });

  it("flags a capped review queue", () => {
    const reasons = computeAlertReasons(
      makeSummary({
        discovery: { candidatesSeen: 1, alreadyTracked: 0, autoPublished: 0, draftsCreated: 0, quarantined: 0, fetchFailed: [], dbErrors: [], queueCapped: true, deferredCandidates: 1 },
      }),
    );
    expect(reasons.some((r) => r.includes("capacity"))).toBe(true);
  });

  it("flags every GMP source failing", () => {
    const reasons = computeAlertReasons(
      makeSummary({
        perSource: {
          ipowatch: { success: 0, failure: 5 },
          sahi: { success: 0, failure: 5 },
          ipoji: { success: 0, failure: 5 },
        },
      }),
    );
    expect(reasons.some((r) => r.includes("Every GMP source"))).toBe(true);
  });

  it("flags filing evidence capture failures", () => {
    const reasons = computeAlertReasons(makeSummary({
      filings: { captured: 0, skipped: 0, failed: [{ ipoName: "X", error: "not a PDF" }] },
    }));
    expect(reasons.some((reason) => reason.includes("filing evidence"))).toBe(true);
  });

  it("flags an official catalogue refresh failure", () => {
    const reasons = computeAlertReasons(makeSummary({
      catalogue: { seen: 0, stored: 0, linked: 0, error: "SEBI HTTP 503" },
    }));
    expect(reasons.some((reason) => reason.includes("catalogue refresh"))).toBe(true);
  });

  it("does not flag a source with zero attempts as down", () => {
    const reasons = computeAlertReasons(makeSummary({ perSource: {} }));
    expect(reasons).toEqual([]);
  });

  it("flags failed reminder deliveries", () => {
    const reasons = computeAlertReasons(makeSummary({ reminders: { sent: 1, failed: 2, skipped: 0 } }));
    expect(reasons.some((r) => r.includes("reminder email"))).toBe(true);
  });

  it("does not flag partial single-source GMP failure as a crisis", () => {
    // sahi failing 1/5 while the other two sources succeed is normal
    // degraded-but-fine operation, not alert-worthy.
    expect(computeAlertReasons(makeSummary())).toEqual([]);
  });
});
