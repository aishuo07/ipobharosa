import { describe, expect, it, vi } from "vitest";
import { BseOfficialSource, parseBseDetail, selectBseIssue, type BseCatalogueIssue } from "./bse";

const issue: BseCatalogueIssue = {
  Scrip_Name: "SHIPROCKET LIMITED",
  Start_Dt: "2026-08-12T00:00:00",
  End_Dt: "2026-08-14T00:00:00",
  Price_Band: "92.00 - 97.00",
  Face_Val: 10,
  IR_flag: "IPO",
  IR_FLAG_FULL: "IPO",
  eXCHANGE_PLATFORM: "MainBoard",
  IPO_NO: 7882,
};

const response = {
  IPONO_0: [{
    ScripName: "SHIPROCKET LIMITED",
    Symbol: "SHIPROCKET",
    Issue_Period: "12 Aug 2026 to 14 Aug 2026",
    IPO_Market_Timings: "10.00 am to 5.00 pm",
    Cut_off_time_for_UPI_Mandate_Confirmation: "14-August-2026 (Upto 5.00 pm)",
    Issue_Size_No_of_shares: "94436030",
    Price_Band: "92.00-97.00|/Employee Discount of Rs 9 to Eligible Employees|",
    Price_Band_Advertisement: "https://listing.bseindia.com/price-band.pdf",
    Face_Value: "10.00",
    Market_Lot: "154",
    Minimum_Bid_Quantity: "154",
    Maximum_Bid_Quantity_For_Qualified_Institutional_Investors: "94315452",
    Maximum_Bid_Quantity_For_Qualified_Non_Institutional_Investors: "43345610",
    Book_Running_Lead_Manager: "Axis Capital Limited^address|email#JM Financial Limited^address|email",
    Registrar: "KFin Technologies Limited^address|email",
    Sponsor_Bank: "HDFC BANK^address|email#ICICI BANK^address|email",
    Prospectus_GID: "https://listing.bseindia.com/RHP.zip",
  }],
  IPONO_4: [{ SUBJECT: "Anchor allocation", FILENAME: "https://www.bseindia.com/anchor.pdf" }],
};

describe("BSE official adapter", () => {
  it("matches legal suffix variants without fuzzy matching", () => {
    expect(selectBseIssue([issue], "Shiprocket Ltd")?.IPO_NO).toBe(7882);
    expect(selectBseIssue([
      { ...issue, Scrip_Name: "Shiprocket India Technology Limited" },
      { ...issue, Scrip_Name: "Shiprocket India Logistics Limited", IPO_NO: 9 },
    ], "Shiprocket India")).toBeNull();
  });

  it("normalizes core facts, application facts and official documents", () => {
    const evidence = parseBseDetail(issue, response, new Date("2026-08-14T13:30:00Z"));
    expect(evidence.facts).toMatchObject({
      companyName: "SHIPROCKET LIMITED",
      board: "MAINBOARD",
      priceBandLow: 92,
      priceBandHigh: 97,
      lotSize: 154,
      registrar: "KFin Technologies Limited",
      leadManagers: ["Axis Capital Limited", "JM Financial Limited"],
      rhpUrl: "https://listing.bseindia.com/RHP.zip",
    });
    expect(evidence.facts.openDate?.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(evidence.enrichment).toMatchObject({ issueType: "IPO", symbol: "SHIPROCKET", faceValue: 10, minimumBidQuantity: 154 });
    expect(evidence.enrichment?.sponsorBanks).toEqual(["HDFC BANK", "ICICI BANK"]);
    expect(evidence.enrichment?.documents.map((document) => document.kind)).toEqual(["PROSPECTUS", "PRICE_BAND", "NOTICE"]);
  });

  it("accepts BSE issue-period dates with an extension note", () => {
    const evidence = parseBseDetail(issue, {
      ...response,
      IPONO_0: [{ ...response.IPONO_0[0], Issue_Period: "04 Aug 2026 to 07-Aug-2026|Issue-has-extended-from-04th-August-2026" }],
    });
    expect(evidence.facts.openDate?.toISOString()).toBe("2026-08-04T00:00:00.000Z");
    expect(evidence.facts.closeDate?.toISOString()).toBe("2026-08-07T00:00:00.000Z");
  });

  it("returns a typed non-IPO outcome without fetching issue detail", async () => {
    const request = vi.fn(async () => JSON.stringify({ Table: [{ ...issue, IR_flag: "FPO", IR_FLAG_FULL: "FPO" }] }));
    const source = new BseOfficialSource(request);
    const result = await source.findEvidence("Shiprocket Limited");
    expect(result).toMatchObject({ status: "WRONG_ISSUE_TYPE", issueType: "FPO" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("caches both catalogues while checking multiple candidates", async () => {
    const request = vi.fn(async (url: URL) => {
      if (url.pathname.includes("GetMkt_ISSUE")) return JSON.stringify(response);
      return JSON.stringify({ Table: [issue] });
    });
    const source = new BseOfficialSource(request);
    expect((await source.findEvidence("Shiprocket Limited")).status).toBe("FOUND");
    expect((await source.findEvidence("Missing Limited")).status).toBe("NOT_FOUND");
    expect(request).toHaveBeenCalledTimes(3);
  });
});
