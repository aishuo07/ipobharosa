import { describe, expect, it } from "vitest";
import type { BoardIpo } from "./board-data";
import { buildIcs, googleCalendarSubscriptionUrl, ipoCalendarEvents } from "./calendar";
import { resolveSiteUrl } from "./site-url";

const ipo = {
  id: "ipo-1", slug: "test-ipo", companyName: "Test & Co", sector: "Tech",
  status: "OPEN", board: "MAINBOARD", priceBandLow: 100, priceBandHigh: 110,
  verification: { state: "VERIFIED", label: "Automated verification passed", shortLabel: "Verified", calendarLabel: "Verified", description: "Verified", checkedAt: null, nextCheckAt: null, issueSummary: null },
  lotSize: 10, issueSizeCr: 100, freshIssueCr: null, ofsCr: null,
  openDate: "2026-08-10T00:00:00.000Z", closeDate: "2026-08-12T00:00:00.000Z",
  allotmentDate: "2026-08-14T00:00:00.000Z", refundDate: "2026-08-15T00:00:00.000Z",
  listingDate: "2026-08-17T00:00:00.000Z", listingPrice: null, registrar: null,
  leadManagers: [], gmp: null, subscription: null, gmpHistory: [], documents: [],
  financials: [], provenance: { discovery: [], gmp: [], subscription: null, officialFields: [] },
} satisfies BoardIpo;

describe("IPO calendar export", () => {
  it("creates the four decision dates for an IPO", () => {
    expect(ipoCalendarEvents(ipo).map((event) => event.title)).toEqual([
      "[Verified] Test & Co: IPO opens", "[Verified] Test & Co: IPO closes", "[Verified] Test & Co: Allotment expected", "[Verified] Test & Co: Listing expected",
    ]);
  });

  it("carries pending verification warnings outside the website", () => {
    const pending = {
      ...ipo,
      verification: { ...ipo.verification, state: "PENDING" as const, calendarLabel: "Verification pending", description: "Values and dates may change." },
    };
    const [event] = ipoCalendarEvents(pending);
    expect(event.title).toBe("[Verification pending] Test & Co: IPO opens");
    expect(event.description).toContain("Values and dates may change");
    expect(buildIcs([pending])).toContain("SUMMARY:[Verification pending] Test & Co: IPO opens");
  });

  it("creates a standards-shaped calendar with stable event IDs and source links", () => {
    const result = buildIcs([ipo]);
    expect(result).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(result).toContain("UID:ipo-1-opens@ipobharosa");
    expect(result).toContain(`URL:${resolveSiteUrl()}/ipo/test-ipo`);
    expect(result.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(result).toContain("X-WR-CALNAME:IPOBharosa — All IPOs");
  });

  it("builds Google Calendar subscription links for all and board-specific feeds", () => {
    expect(googleCalendarSubscriptionUrl()).toContain("https://calendar.google.com/calendar/render?cid=");
    expect(decodeURIComponent(googleCalendarSubscriptionUrl())).toContain(`${resolveSiteUrl()}/api/calendar`);
    expect(decodeURIComponent(googleCalendarSubscriptionUrl("MAINBOARD"))).toContain("/api/calendar?board=MAINBOARD");
    expect(decodeURIComponent(googleCalendarSubscriptionUrl("SME"))).toContain("/api/calendar?board=SME");
    expect(buildIcs([ipo], "SME")).toContain("X-WR-CALNAME:IPOBharosa — SME");
  });

  it("creates a truly IPO-scoped Google Calendar subscription", () => {
    expect(decodeURIComponent(googleCalendarSubscriptionUrl("ALL", "test-ipo"))).toContain("/api/calendar?ipo=test-ipo");
  });
});
