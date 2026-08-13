import { describe, expect, it, vi } from "vitest";
import { NseOfficialSource, parseNseDetail, selectNseIssue } from "./nse";

const catalogue = [
  {
    companyName: "Shiprocket Limited",
    issueStartDate: "12-Aug-2026",
    issueEndDate: "14-Aug-2026",
    issuePrice: "Rs.92 to Rs.97",
    series: "EQ",
    status: "Active",
    symbol: "SHIPROCKET",
  },
];

const detail = {
  issueInfo: {
    dataList: [
      { title: "Shiprocket Limited", value: "" },
      { title: "Issue Period", value: "12-Aug-2026 to 14-Aug-2026" },
      { title: "Price Range", value: "Rs. 92 to Rs. 97 per Equity Share" },
      { title: "Bid Lot", value: "154 Equity Shares and in multiples thereof" },
      { title: "Book Running Lead Managers", value: "Axis Capital Limited and JM Financial Limited" },
      { title: "Name of the Registrar", value: "KFin Technologies Limited" },
      { title: "Red Herring Prospectus", value: "https://nsearchives.nseindia.com/content/ipo/RHP_SHIPROCKET.zip" },
    ],
  },
};

describe("NSE official adapter parsing", () => {
  it("matches an issuer despite harmless legal-suffix differences", () => {
    expect(selectNseIssue(catalogue, "Shiprocket Ltd")?.symbol).toBe("SHIPROCKET");
  });

  it("normalizes all material facts and preserves clickable provenance", () => {
    const evidence = parseNseDetail(catalogue[0], detail, new Date("2026-08-12T12:00:00Z"));
    expect(evidence.facts).toMatchObject({
      companyName: "Shiprocket Limited",
      board: "MAINBOARD",
      priceBandLow: 92,
      priceBandHigh: 97,
      lotSize: 154,
      registrar: "KFin Technologies Limited",
      leadManagers: ["Axis Capital Limited", "JM Financial Limited"],
      rhpUrl: "https://nsearchives.nseindia.com/content/ipo/RHP_SHIPROCKET.zip",
    });
    expect(evidence.facts.openDate?.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(evidence.sourceUrl).toContain("symbol=SHIPROCKET");
    expect(evidence.fieldSources.priceBandLow).toBe(evidence.sourceUrl);
  });

  it("downloads the catalogue once when checking several candidates", async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(JSON.stringify(url.includes("ipo-detail") ? detail : catalogue), { status: 200 });
    };
    const fetchSpy = vi.fn(fetchImpl) as unknown as typeof fetch;
    const source = new NseOfficialSource(fetchSpy);

    await source.findEvidence("Shiprocket Limited");
    await source.findEvidence("Missing Limited");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
