import { describe, expect, it } from "vitest";
import { digestDateInIst, renderDailyDigest } from "./digest";
import { EMPTY_SUMMARY } from "./run-cycle";

describe("daily ingestion digest", () => {
  it("uses the India calendar date across UTC midnight", () => {
    expect(digestDateInIst(new Date("2026-08-13T20:30:00Z")).toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("includes the operational decisions that require attention", () => {
    const html = renderDailyDigest({
      summary: {
        ...structuredClone(EMPTY_SUMMARY),
        revalidation: { ...EMPTY_SUMMARY.revalidation, published: 3, retries: 2, exceptions: 1 },
        publishedRevalidation: { ...EMPTY_SUMMARY.publishedRevalidation, drifts: 1 },
      },
      publicationCounts: { PUBLISHED: 20, DRAFT: 4, QUARANTINED: 2 },
      openIncidents: 3,
      financialReviews: 5,
      unhealthySources: ["NSE ipo-evidence"],
    });
    expect(html).toContain("3 newly published");
    expect(html).toContain("1 published-data drift");
    expect(html).toContain("NSE ipo-evidence");
  });
});
