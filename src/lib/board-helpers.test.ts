import { describe, expect, it } from "vitest";
import type { BoardIpo } from "./board-data";
import {
  badgeText,
  confidenceLabel,
  effectiveStatus,
  gmpAvailabilityText,
  gmpAvailabilityDetailText,
  gmpPct,
  isStale,
  listingGainPct,
  registrarAllotmentUrl,
  subscriptionAvailabilityText,
  subSummary,
} from "./board-helpers";

function makeIpo(overrides: Partial<BoardIpo> = {}): BoardIpo {
  return {
    id: "1",
    slug: "test-co",
    companyName: "Test Co",
    sector: "Tech",
    status: "OPEN",
    board: "MAINBOARD",
    priceBandLow: 90,
    priceBandHigh: 100,
    lotSize: 100,
    issueSizeCr: 500,
    freshIssueCr: 500,
    ofsCr: null,
    openDate: "2026-08-01T00:00:00.000Z",
    closeDate: "2026-08-05T00:00:00.000Z",
    allotmentDate: "2026-08-07T00:00:00.000Z",
    refundDate: "2026-08-08T00:00:00.000Z",
    listingDate: "2026-08-10T00:00:00.000Z",
    listingPrice: null,
    registrar: null,
    leadManagers: [],
    gmp: null,
    subscription: null,
    gmpHistory: [],
    documents: [],
    financials: [],
    provenance: { discovery: [], gmp: [], subscription: null, officialFields: [] },
    verification: {
      state: "VERIFIED",
      label: "Verified from official sources",
      shortLabel: "Verified",
      description: "Core IPO terms match official sources.",
      calendarLabel: "Verified",
      checkedAt: null,
      nextCheckAt: null,
      issueSummary: null,
    },
    ...overrides,
  };
}

describe("isStale", () => {
  const capturedAt = new Date("2026-08-11T10:00:00.000Z").toISOString();

  it("is not stale exactly at the 2-hour threshold", () => {
    const now = new Date("2026-08-11T12:00:00.000Z").getTime();
    expect(isStale(capturedAt, now)).toBe(false);
  });

  it("is stale one millisecond past the 2-hour threshold", () => {
    const now = new Date("2026-08-11T12:00:00.001Z").getTime();
    expect(isStale(capturedAt, now)).toBe(true);
  });

  it("is not stale well within the threshold", () => {
    const now = new Date("2026-08-11T10:30:00.000Z").getTime();
    expect(isStale(capturedAt, now)).toBe(false);
  });
});

describe("subSummary", () => {
  it("reports bidding not open yet for an UPCOMING IPO with no subscription data", () => {
    expect(subSummary(makeIpo({ status: "UPCOMING", subscription: null }))).toBe("Bidding not open yet");
  });

  it("reports an exchange update wait for an OPEN IPO with no subscription data yet", () => {
    expect(subSummary(makeIpo({ status: "OPEN", subscription: null }))).toBe("Awaiting exchange update");
  });

  it("reports final subscription unavailable for a LISTED IPO with no subscription data", () => {
    expect(subSummary(makeIpo({ status: "LISTED", subscription: null }))).toBe("Final demand unavailable");
  });

  it("reports final demand unavailable after bidding closes", () => {
    expect(subSummary(makeIpo({ status: "CLOSED", subscription: null }))).toBe("Final demand unavailable");
  });

  it("averages over 3 categories when there is no employee quota", () => {
    const ipo = makeIpo({
      subscription: { qibX: 3, niiX: 6, retailX: 3, employeeX: null, capturedAt: "2026-08-01T00:00:00.000Z" },
    });
    // (3 + 6 + 3) / 3 = 4.0
    expect(subSummary(ipo)).toBe("3.0x retail · 4.0x category avg");
  });

  it("averages over 4 categories when an employee quota is present", () => {
    const ipo = makeIpo({
      subscription: { qibX: 4, niiX: 8, retailX: 4, employeeX: 4, capturedAt: "2026-08-01T00:00:00.000Z" },
    });
    // (4 + 8 + 4 + 4) / 4 = 5.0
    expect(subSummary(ipo)).toBe("4.0x retail · 5.0x category avg");
  });

  it("uses the exchange-reported total instead of averaging categories", () => {
    const ipo = makeIpo({
      subscription: { qibX: 4, niiX: 8, retailX: 4, employeeX: 4, totalX: 6.7, capturedAt: "2026-08-01T00:00:00.000Z" },
    });
    expect(subSummary(ipo)).toBe("4.0x retail · 6.7x overall");
  });
});

describe("missing market signal copy", () => {
  it("describes a missing current GMP as an absent tracked quote", () => {
    expect(gmpAvailabilityText(makeIpo({ status: "OPEN", gmp: null }))).toBe("No tracked GMP quote yet");
  });

  it("describes missing listed GMP as history rather than a current quote", () => {
    expect(gmpAvailabilityText(makeIpo({ status: "LISTED", gmp: null }))).toBe("No tracked GMP history");
  });

  it("shows the exact classified reason for missing GMP", () => {
    expect(gmpAvailabilityText(makeIpo({ gmp: null, gmpAvailability: { kind: "NOT_YET_AVAILABLE", checkedAt: null, checkedSources: 3 } }))).toBe("GMP quote not published yet");
    expect(gmpAvailabilityText(makeIpo({ gmp: null, gmpAvailability: { kind: "NOT_COVERED", checkedAt: null, checkedSources: 3 } }))).toBe("Not covered by tracked GMP sources");
    expect(gmpAvailabilityText(makeIpo({ gmp: null, gmpAvailability: { kind: "ERROR", checkedAt: null, checkedSources: 3 } }))).toBe("GMP source check failed · retrying");
  });

  it("explains how many tracked sources produced the missing-GMP state", () => {
    const ipo = makeIpo({ gmp: null, gmpAvailability: { kind: "NOT_COVERED", checkedAt: null, checkedSources: 4 } });
    expect(gmpAvailabilityDetailText(ipo)).toBe("4 tracked sources checked; this IPO is outside their current coverage");
  });

  it("explains when subscription figures will appear", () => {
    expect(subscriptionAvailabilityText(makeIpo({ status: "UPCOMING", subscription: null }))).toBe("Figures appear after bidding opens");
    expect(subscriptionAvailabilityText(makeIpo({ status: "OPEN", subscription: null }))).toBe("Checked hourly while bidding is open");
    expect(subscriptionAvailabilityText(makeIpo({ status: "CLOSED", subscription: null }))).toBe("No final exchange snapshot captured");
  });
});

describe("confidenceLabel", () => {
  it("maps every tier to neutral source-agreement language", () => {
    expect(confidenceLabel("HIGH")).toBe("Strong source agreement");
    expect(confidenceLabel("MEDIUM")).toBe("Mixed source agreement");
    expect(confidenceLabel("LOW")).toBe("Limited source agreement");
  });
});

describe("listingGainPct", () => {
  it("returns null when there is no listing price yet", () => {
    expect(listingGainPct(makeIpo({ listingPrice: null }))).toBeNull();
  });

  it("returns exactly 0 when the listing price equals the price band high", () => {
    expect(listingGainPct(makeIpo({ priceBandHigh: 100, listingPrice: 100 }))).toBe(0);
  });

  it("computes a negative gain when the listing price is below the band high", () => {
    expect(listingGainPct(makeIpo({ priceBandHigh: 100, listingPrice: 80 }))).toBe(-20);
  });
});

describe("effectiveStatus", () => {
  const now = new Date("2026-08-01T00:00:00.000Z").getTime();

  it("treats a boundary listing price exactly at the band high as a gain, not a loss", () => {
    const status = effectiveStatus(makeIpo({ status: "LISTED", priceBandHigh: 100, listingPrice: 100 }), now);
    expect(status).toBe("listed-gain");
  });

  it("treats a listing price below the band high as a loss", () => {
    const status = effectiveStatus(makeIpo({ status: "LISTED", priceBandHigh: 100, listingPrice: 90 }), now);
    expect(status).toBe("listed-loss");
  });

  it("flags an OPEN IPO closing within 36 hours as closing-soon", () => {
    const status = effectiveStatus(
      makeIpo({ status: "OPEN", closeDate: new Date(now + 10 * 3600 * 1000).toISOString() }),
      now,
    );
    expect(status).toBe("closing-soon");
  });

  it("does not flag an OPEN IPO closing well beyond 36 hours", () => {
    const status = effectiveStatus(
      makeIpo({ status: "OPEN", closeDate: new Date(now + 72 * 3600 * 1000).toISOString() }),
      now,
    );
    expect(status).toBe("open");
  });

  it("uses the listing date even when ingestion has not stored a listing price", () => {
    const status = effectiveStatus(makeIpo({
      status: "CLOSED",
      listingDate: "2026-07-31T00:00:00.000Z",
      listingPrice: null,
    }), now);
    expect(status).toBe("listed-pending");
  });

  it("does not classify a stored LISTED row without price as a loss", () => {
    expect(effectiveStatus(makeIpo({ status: "LISTED", listingPrice: null }), now)).toBe("listed-pending");
  });
});

describe("gmpPct", () => {
  it("returns 0.0 when there is no GMP data", () => {
    expect(gmpPct(makeIpo({ gmp: null }))).toBe("0.0");
  });
});

describe("badgeText", () => {
  it("maps every effective status to its display label", () => {
    expect(badgeText("open")).toBe("Open");
    expect(badgeText("closing-soon")).toBe("Closing soon");
    expect(badgeText("upcoming")).toBe("Upcoming");
    expect(badgeText("closed")).toBe("Awaiting allotment");
    expect(badgeText("listed-pending")).toBe("Listed · Price pending");
    expect(badgeText("listed-gain")).toBe("Listed · Gain");
    expect(badgeText("listed-loss")).toBe("Listed · Loss");
  });
});

describe("registrarAllotmentUrl", () => {
  it("returns null when there is no registrar", () => {
    expect(registrarAllotmentUrl(null)).toBeNull();
  });

  it("returns null when the registrar doesn't match any known portal", () => {
    expect(registrarAllotmentUrl("Some Unknown Registrar Pvt. Ltd.")).toBeNull();
  });

  it("matches case-insensitively despite punctuation/suffix variation", () => {
    expect(registrarAllotmentUrl("KFin Technologies Pvt. Ltd.")).toBe("https://ipostatus.kfintech.com/");
    expect(registrarAllotmentUrl("BIGSHARE SERVICES PRIVATE LIMITED")).toBe("https://ipo.bigshareonline.com/");
  });
});
