import { describe, expect, it, vi } from "vitest";
import { checkMufgAllotment, checkMufgAllotmentForPans, registrarCheck } from "@/src/lib/allotment";
import type { BoardIpo } from "@/src/lib/types";

function makeIpo(overrides: Partial<BoardIpo> = {}): BoardIpo {
  return {
    id: "ipo-1",
    slug: "example-ipo",
    companyName: "Example Limited",
    sector: "",
    status: "CLOSED",
    board: "MAINBOARD",
    verification: { state: "PENDING", label: "Pending verification" },
    priceBandLow: 100,
    priceBandHigh: 110,
    lotSize: 50,
    issueSizeCr: 100,
    freshIssueCr: 100,
    ofsCr: 0,
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
    provenance: { discovery: [], gmp: [], subscription: null },
    ...overrides,
  };
}

describe("registrarCheck", () => {
  it("flags MUFG / Link Intime as automatable", () => {
    expect(registrarCheck(makeIpo({ registrar: "MUFG Intime India Pvt Ltd" }))).toEqual({
      automatable: true,
      portalUrl: "https://linkintime.co.in/initial_offer/public-issues.html",
    });
  });

  it("flags CAPTCHA-gated registrars as non-automatable with a portal link", () => {
    expect(registrarCheck(makeIpo({ registrar: "KFin Technologies Ltd" }))).toEqual({
      automatable: false,
      portalUrl: "https://ipostatus.kfintech.com",
    });
    expect(registrarCheck(makeIpo({ registrar: "Bigshare Services Pvt Ltd" }))).toEqual({
      automatable: false,
      portalUrl: "https://ipo.bigshareonline.com/ipo_status.html",
    });
  });

  it("falls back to the BSE portal for unknown registrars", () => {
    expect(registrarCheck(makeIpo({ registrar: "Some Other Registrar" }))).toEqual({
      automatable: false,
      portalUrl: "https://www.bseindia.com/investors/appli_check.aspx",
    });
  });
});

describe("checkMufgAllotment (XML payloads)", () => {
  const ipo = makeIpo({
    companyName: "Behari Lal Engineering Limited - IPO",
    registrar: "MUFG Intime India Private Limited",
  });

  it("parses the XML company list and reports ALLOTTED when ALLOT > 0", async () => {
    const listXml = `{"d":"<NewDataSet><Table><company_id>11922</company_id><companyname>Behari Lal Engineering Limited - IPO</companyname></Table></NewDataSet>"}`;
    const searchXml = `{"d":"<NewDataSet><Table><id>11922</id><offer_price>285</offer_price><NAME1>AISH KANODIA</NAME1><companyname>Behari Lal Engineering Limited - IPO</companyname><ALLOT>52</ALLOT><SHARES>52</SHARES><AMTADJ>0</AMTADJ><PEMNDG>Retail</PEMNDG></Table></NewDataSet>"}`;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(listXml, { status: 200 }))
      .mockResolvedValueOnce(new Response(searchXml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkMufgAllotment(ipo, "HFQPK9233H");
    expect(result.status).toBe("ALLOTTED");
    expect(result.applicant).toBe("AISH KANODIA");
    expect(result.applied).toBe("52");
    expect(result.allotted).toBe("52");

    vi.unstubAllGlobals();
  });

  it("reports NOT_ALLOTTED when ALLOT is 0", async () => {
    const listXml = `{"d":"<NewDataSet><Table><company_id>11922</company_id><companyname>Behari Lal Engineering Limited - IPO</companyname></Table></NewDataSet>"}`;
    const searchXml = `{"d":"<NewDataSet><Table><id>11922</id><NAME1>AISH KANODIA</NAME1><ALLOT>0</ALLOT><SHARES>52</SHARES><AMTADJ>0</AMTADJ></Table></NewDataSet>"}`;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(listXml, { status: 200 }))
      .mockResolvedValueOnce(new Response(searchXml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkMufgAllotment(ipo, "HFQPK9233H");
    expect(result.status).toBe("NOT_ALLOTTED");
    expect(result.allotted).toBe("0");
    expect(result.applicant).toBe("AISH KANODIA");

    vi.unstubAllGlobals();
  });

  it("reports NOT_APPLIED when the search returns no rows", async () => {
    const listXml = `{"d":"<NewDataSet><Table><company_id>11922</company_id><companyname>Behari Lal Engineering Limited - IPO</companyname></Table></NewDataSet>"}`;
    const searchXml = `{"d":"<NewDataSet></NewDataSet>"}`;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(listXml, { status: 200 }))
      .mockResolvedValueOnce(new Response(searchXml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkMufgAllotment(ipo, "HFQPK9233H");
    expect(result.status).toBe("NOT_APPLIED");

    vi.unstubAllGlobals();
  });
});

describe("checkMufgAllotmentForPans (batch)", () => {
  const ipo = makeIpo({
    companyName: "Behari Lal Engineering Limited - IPO",
    registrar: "MUFG Intime India Private Limited",
  });

  it("fetches the company list once and checks every PAN", async () => {
    const listXml = `{"d":"<NewDataSet><Table><company_id>11922</company_id><companyname>Behari Lal Engineering Limited - IPO</companyname></Table></NewDataSet>"}`;
    const searchXml = (allot: number) =>
      `{"d":"<NewDataSet><Table><id>11922</id><NAME1>AISH KANODIA</NAME1><ALLOT>${allot}</ALLOT><SHARES>52</SHARES><AMTADJ>0</AMTADJ></Table></NewDataSet>"}`;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(listXml, { status: 200 }))
      .mockResolvedValueOnce(new Response(searchXml(52), { status: 200 }))
      .mockResolvedValueOnce(new Response(searchXml(0), { status: 200 }))
      .mockResolvedValueOnce(new Response(`{"d":"<NewDataSet></NewDataSet>"}`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await checkMufgAllotmentForPans(ipo, ["HFQPK9233H", "ABCDE1234F", "ZYXWV9876Q"]);
    expect(results.map((r) => r.status)).toEqual(["ALLOTTED", "NOT_ALLOTTED", "NOT_APPLIED"]);
    // 1 company-list call + 3 search calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("SearchOnPan"))).toHaveLength(3);

    vi.unstubAllGlobals();
  });

  it("returns a NOT_FOUND-style error for every PAN when the company is missing from MUFG", async () => {
    const listXml = `{"d":"<NewDataSet><Table><company_id>999</company_id><companyname>Some Other IPO</companyname></Table></NewDataSet>"}`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(listXml, { status: 200 })));

    const results = await checkMufgAllotmentForPans(ipo, ["HFQPK9233H", "ABCDE1234F"]);
    expect(results.every((r) => r.status === "ERROR" && r.error)).toBe(true);

    vi.unstubAllGlobals();
  });

  it("returns an empty list when there are no PANs", async () => {
    const results = await checkMufgAllotmentForPans(ipo, []);
    expect(results).toEqual([]);
  });
});