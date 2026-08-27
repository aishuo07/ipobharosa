import { describe, expect, it, vi } from "vitest";
import { NseOfficialSource, parseNseDetail, selectHistoricalNseIssue, selectNseIssue, selectNseListing } from "./nse";

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
  bidDetails: [
    { category: "Qualified Institutional Buyers(QIBs)", noOfTime: "12.5", srNo: "1" },
    { category: "Non Institutional Investors", noOfTime: "8.25", srNo: "2" },
    { category: "Retail Individual Investors(RIIs)", noOfTime: "4.5", srNo: "3" },
    { category: "Employees", noOfTime: "2", srNo: "4" },
    { category: "Total", noOfTime: "7.9", srNo: null },
  ],
};

const historicalCatalogue = [{
  company: "Teja Engineering Industries Limited",
  ipoStartDate: "30-JUN-2026",
  ipoEndDate: "02-JUL-2026",
  issuePrice: "220",
  priceRange: "Rs.220",
  securityType: "SME",
  symbol: "TEJA",
}];

const historicalDetail = {
  issueInfo: {
    dataList: [
      { title: "Issue Period", value: "30-Jun-2026 to 02-Jul-2026" },
      { title: "Price Range", value: "Rs. 220 per equity share" },
      { title: "Lot Size", value: "600 Equity Shares" },
      { title: "Book Running Lead Managers", value: "Interactive Financial Services Limited" },
      { title: "Name of the Registrar", value: "Kfin Technologies Limited" },
      { title: "Prospectus", value: "https://nsearchives.nseindia.com/content/ipo/PROSPECTUS_TEJA.zip" },
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
    expect(evidence.enrichment?.demand).toMatchObject({ qibX: 12.5, niiX: 8.25, retailX: 4.5, employeeX: 2, totalX: 7.9 });
  });

  it("matches one unambiguous shortened issuer name in the historical catalogue", () => {
    expect(selectHistoricalNseIssue(historicalCatalogue, "Teja Engineering")?.symbol).toBe("TEJA");
    expect(selectHistoricalNseIssue([
      ...historicalCatalogue,
      { ...historicalCatalogue[0], company: "Teja Engineering Projects Limited", symbol: "OTHER" },
    ], "Teja Engineering")).toBeNull();
  });

  it("resolves a real listing price + date once NSE has published them", () => {
    const listing = selectNseListing([
      ...historicalCatalogue,
      {
        company: "Milky Mist Dairy Food Limited",
        ipoEndDate: "13-AUG-2026",
        issuePrice: "   140",
        listingDate: "18-AUG-2026",
        securityType: "EQ",
        symbol: "MILKYMIST",
      },
    ], "Milky Mist Dairy Food Ltd");
    expect(listing).toEqual({ listingPrice: 140, listingDate: new Date(Date.UTC(2026, 7, 18)) });
  });

  it("returns null before NSE publishes a listing price (issuePrice is '-')", () => {
    expect(selectNseListing([
      { company: "Credent Connect N Care Limited", issuePrice: "-", listingDate: "-", securityType: "SME", symbol: "CREDENT" },
    ], "Credent Connect N Care Limited")).toBeNull();
  });

  it("returns null when the historical row cannot be uniquely matched", () => {
    expect(selectNseListing([
      { company: "Teja Engineering Industries Limited", issuePrice: "220", listingDate: "06-JUL-2026", symbol: "TEJA" },
      { company: "Teja Engineering Projects Limited", issuePrice: "220", listingDate: "06-JUL-2026", symbol: "OTHER" },
    ], "Teja Engineering")).toBeNull();
  });

  it("falls back to the official historical catalogue and parses SME detail labels", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes("public-past-issues")
        ? historicalCatalogue
        : url.includes("ipo-detail")
          ? historicalDetail
          : catalogue;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const source = new NseOfficialSource(fetchImpl);

    const result = await source.findEvidence("Teja Engineering");

    expect(result.status).toBe("FOUND");
    if (result.status !== "FOUND") return;
    expect(result.evidence.facts).toMatchObject({
      companyName: "Teja Engineering Industries Limited",
      board: "SME",
      priceBandLow: 220,
      priceBandHigh: 220,
      lotSize: 1200,
      registrar: "Kfin Technologies Limited",
      rhpUrl: "https://nsearchives.nseindia.com/content/ipo/PROSPECTUS_TEJA.zip",
    });
    expect(result.evidence.sourceUrl).toContain("type=Past");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("type=Past"),
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
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

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
