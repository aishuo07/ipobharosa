import { describe, expect, it } from "vitest";
import type { BoardIpo } from "./board-data";
import { buildIcs, googleCalendarSubscriptionUrl, ipoCalendarEvents } from "./calendar";

const ipo = {
  id: "ipo-1", slug: "test-ipo", companyName: "Test & Co", sector: "Tech",
  status: "OPEN", board: "MAINBOARD", priceBandLow: 100, priceBandHigh: 110,
  lotSize: 10, issueSizeCr: 100, freshIssueCr: null, ofsCr: null,
  openDate: "2026-08-10T00:00:00.000Z", closeDate: "2026-08-12T00:00:00.000Z",
  allotmentDate: "2026-08-14T00:00:00.000Z", refundDate: "2026-08-15T00:00:00.000Z",
  listingDate: "2026-08-17T00:00:00.000Z", listingPrice: null, registrar: null,
  leadManagers: [], gmp: null, subscription: null, gmpHistory: [], documents: [],
  financials: [], provenance: { discovery: [], gmp: [], subscription: null },
} satisfies BoardIpo;

describe("IPO calendar export", () => {
  it("creates the four decision dates for an IPO", () => {
    expect(ipoCalendarEvents(ipo).map((event) => event.title)).toEqual([
      "Test & Co: IPO opens", "Test & Co: IPO closes", "Test & Co: Allotment expected", "Test & Co: Listing expected",
    ]);
  });

  it("creates a standards-shaped calendar with stable event IDs and source links", () => {
    const result = buildIcs([ipo]);
    expect(result).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(result).toContain("UID:ipo-1-opens@ipobharosa");
    expect(result).toContain("URL:https://ipobharosa.vercel.app/ipo/test-ipo");
    expect(result.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(result).toContain("X-WR-CALNAME:IPOBharosa — All IPOs");
  });

  it("builds Google Calendar subscription links for all and board-specific feeds", () => {
    expect(decodeURIComponent(googleCalendarSubscriptionUrl())).toContain("https://ipobharosa.vercel.app/api/calendar");
    expect(decodeURIComponent(googleCalendarSubscriptionUrl("MAINBOARD"))).toContain("/api/calendar?board=MAINBOARD");
    expect(decodeURIComponent(googleCalendarSubscriptionUrl("SME"))).toContain("/api/calendar?board=SME");
    expect(buildIcs([ipo], "SME")).toContain("X-WR-CALNAME:IPOBharosa — SME");
  });
});
