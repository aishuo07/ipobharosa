import { describe, expect, it } from "vitest";
import { findInvestorGainGmp, investorGainApiUrl, parseInvestorGainRows } from "./investorgain";

const rows = [
  { "~ipo_name": "Credent Connect", GMP: "&#8377;<b>55</b> (29.10%)" },
  { "~ipo_name": "Technocrats Plasma Systems", GMP: "&#8377;<b>32</b> (24.24%)" },
  { "~ipo_name": "ENS Enterprises", GMP: "&#8377;<b>--</b>" },
  { "~ipo_name": "Down Example", GMP: "&#8377;<b>-4</b> (-2.00%)" },
];

describe("InvestorGain GMP adapter", () => {
  it("builds the current report endpoint with the Indian financial year", () => {
    expect(investorGainApiUrl(new Date("2026-08-17T12:00:00Z"))).toContain("/8/2026/2026-27/0/all");
    expect(investorGainApiUrl(new Date("2027-02-01T12:00:00Z"))).toContain("/2/2027/2026-27/0/all");
  });

  it("parses the report rows and known shortened SME names", () => {
    expect(parseInvestorGainRows({ reportTableData: rows })).toHaveLength(4);
    expect(findInvestorGainGmp("Credent Connect N Care", rows)).toEqual({ kind: "VALUE", value: 55 });
    expect(findInvestorGainGmp("Technocrats Plasma", rows)).toEqual({ kind: "VALUE", value: 32 });
  });

  it("preserves a genuine negative premium", () => {
    expect(findInvestorGainGmp("Down Example", rows)).toEqual({ kind: "VALUE", value: -4 });
  });

  it("does not invent zero when the provider has no active quote", () => {
    expect(findInvestorGainGmp("ENS Enterprises", rows)).toMatchObject({ kind: "NOT_YET_AVAILABLE" });
  });

  it("fails safely on malformed responses and unknown IPOs", () => {
    expect(() => parseInvestorGainRows({ rows })).toThrow("reportTableData");
    expect(findInvestorGainGmp("Unknown SME", rows)).toMatchObject({ kind: "NOT_COVERED" });
  });
});
