import { describe, expect, it, vi } from "vitest";
import {
  checkAllotmentForPans,
  checkBigshareAllotmentForPans,
  checkKfintechAllotmentForPans,
  checkMufgAllotment,
  checkMufgAllotmentForPans,
  registrarCheck,
  registrarKind,
} from "@/src/lib/allotment";
import type { BoardIpo } from "@/src/lib/types";
import type { RegistrarCompany } from "@/src/lib/registrar-catalog";

vi.mock("@/src/lib/catalogue-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/catalogue-store")>();
  const snapshots = await import("@/src/lib/registrar-catalog");
  return {
    ...actual,
    fetchRegistrarCatalogue: vi.fn(async (key: string): Promise<RegistrarCompany[]> => {
      const catalogues: Record<string, RegistrarCompany[]> = {
        kfin: snapshots.KFIN_COMPANIES,
        bigshare: snapshots.BIGSHARE_COMPANIES,
        maashitla: snapshots.MAASHITLA_COMPANIES,
        mufg: [],
      };
      return catalogues[key] ?? [];
    }),
  };
});

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

  it("flags KFinTech as automatable via server API", () => {
    expect(registrarCheck(makeIpo({ registrar: "KFin Technologies Ltd" }))).toEqual({
      automatable: true,
      portalUrl: "https://ipostatus.kfintech.com",
    });
  });

  it("flags Bigshare as automatable via server CAPTCHA solving", () => {
    expect(registrarCheck(makeIpo({ registrar: "Bigshare Services Pvt Ltd" }))).toEqual({
      automatable: true,
      portalUrl: "https://ipo.bigshareonline.com/ipo_status.html",
    });
  });

  it("classifies registrar kinds for dispatching", () => {
    expect(registrarKind(makeIpo({ registrar: "MUFG Intime India Pvt Ltd" }))).toBe("mufg");
    expect(registrarKind(makeIpo({ registrar: "KFin Technologies Ltd" }))).toBe("kfintech");
    expect(registrarKind(makeIpo({ registrar: "Bigshare Services Pvt Ltd" }))).toBe("bigshare");
    expect(registrarKind(makeIpo({ registrar: "Cameo Corporate Services Ltd" }))).toBe("cameo");
  });

  it("flags unknown registrars as non-automatable with BSE fallback", () => {
    expect(registrarCheck(makeIpo({ registrar: "Some Unknown Registrar" }))).toEqual({
      automatable: false,
      portalUrl: "https://www.bseindia.com/investors/appli_check.aspx",
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

describe("checkKfintechAllotmentForPans", () => {
  const ipo = makeIpo({
    companyName: "Shiprocket Ltd",
    registrar: "Kfin Technologies Ltd.",
  });

  it("reports ALLOTTED when All_Shares > 0 and NOT_ALLOTTED when 0", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ All_Shares: "52", App_Shares: "154", Name: "AISH KANODIA", Pan_No: "HFQPK9233H" }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ All_Shares: "0", App_Shares: "154", Name: "AISH KANODIA", Pan_No: "HFQPK9233H" }] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const results = await checkKfintechAllotmentForPans(ipo, ["HFQPK9233H", "ABCDE1234F"]);
    expect(results.map((r) => r.status)).toEqual(["ALLOTTED", "NOT_ALLOTTED"]);
    expect(results[0].applicant).toBe("AISH KANODIA");
    expect(results[0].allotted).toBe("52");
    // every call carries the client_id header for the issue
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = firstCall.headers as Record<string, string>;
    expect(headers.client_id).toBe("86153103110");
    expect(headers.reqparam).toBe("HFQPK9233H");

    vi.unstubAllGlobals();
  });

  it("reports NOT_APPLIED when the API returns Record Not Found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: "Record Not Found" }), { status: 200 })));
    const results = await checkKfintechAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("NOT_APPLIED");
    vi.unstubAllGlobals();
  });

  it("returns an ERROR for every PAN when the company is not in the KFinTech catalogue", async () => {
    const unknownIpo = makeIpo({ companyName: "Not In Catalogue Ltd", registrar: "Kfin Technologies Ltd." });
    const results = await checkKfintechAllotmentForPans(unknownIpo, ["HFQPK9233H", "ABCDE1234F"]);
    expect(results.every((r) => r.status === "ERROR" && r.error)).toBe(true);
    expect(results).toHaveLength(2);
  });

  it("returns an empty list when there are no PANs", async () => {
    const results = await checkKfintechAllotmentForPans(ipo, []);
    expect(results).toEqual([]);
  });
});

describe("checkBigshareAllotmentForPans", () => {
  const ipo = makeIpo({
    companyName: "Technocraft Ventures Ltd",
    registrar: "Bigshare Services Private Limited",
  });

  it("reports ALLOTTED when ALLOTED > 0 and NOT_ALLOTTED when 0", async () => {
    const row = (alloted: string) =>
      JSON.stringify({
        d: { __type: "Data+Company", APPLICATION_NO: "AB123", DPID: "1208160064064954", Name: "AISH KANODIA", APPLIED: "50", ALLOTED: alloted },
      });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(row("50"), { status: 200 }))
      .mockResolvedValueOnce(new Response(row("0"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await checkBigshareAllotmentForPans(ipo, ["HFQPK9233H", "ABCDE1234F"]);
    expect(results.map((r) => r.status)).toEqual(["ALLOTTED", "NOT_ALLOTTED"]);
    expect(results[0].applicant).toBe("AISH KANODIA");
    expect(results[1].allotted).toBe("0");
    // the request body carries the company code 9043 and PAN mode PN
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("Company: '9043'");
    expect(body).toContain("SelectionType: 'PN'");
    expect(body).toContain("PanNo: 'HFQPK9233H'");

    vi.unstubAllGlobals();
  });

  it("reports NOT_APPLIED when DPID is No data found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ d: { __type: "Data+Company", DPID: "No data found", Name: "", APPLIED: "", ALLOTED: "" } }), { status: 200 }),
      ),
    );
    const results = await checkBigshareAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("NOT_APPLIED");
    vi.unstubAllGlobals();
  });

  it("returns an ERROR for every PAN when the company is not in the Bigshare catalogue", async () => {
    const unknownIpo = makeIpo({ companyName: "Not In Catalogue Ltd", registrar: "Bigshare Services Pvt Ltd" });
    const results = await checkBigshareAllotmentForPans(unknownIpo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("ERROR");
    expect(results[0].error).toContain("Bigshare");
    vi.unstubAllGlobals();
  });

  it("returns an empty list when there are no PANs", async () => {
    const results = await checkBigshareAllotmentForPans(ipo, []);
    expect(results).toEqual([]);
  });
});

describe("checkAllotmentForPans (dispatcher)", () => {
  it("routes MUFG IPOs to the MUFG adapter", async () => {
    const ipo = makeIpo({ companyName: "Behari Lal Engineering Limited - IPO", registrar: "MUFG Intime India Private Limited" });
    const listXml = `{"d":"<NewDataSet><Table><company_id>11922</company_id><companyname>Behari Lal Engineering Limited - IPO</companyname></Table></NewDataSet>"}`;
    const searchXml = `{"d":"<NewDataSet><Table><id>11922</id><NAME1>AISH KANODIA</NAME1><ALLOT>52</ALLOT><SHARES>52</SHARES></Table></NewDataSet>"}`;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(listXml, { status: 200 }))
        .mockResolvedValueOnce(new Response(searchXml, { status: 200 })),
    );
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("ALLOTTED");
    vi.unstubAllGlobals();
  });

  it("routes KFinTech IPOs to the server API", async () => {
    const ipo = makeIpo({ companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd." });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, results: [{ company: "Shiprocket Ltd", status: "NOT_ALLOTTED", shares: "0", amount: "15400" }] }), { status: 200 }),
      ),
    );
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("NOT_ALLOTTED");
    vi.unstubAllGlobals();
  });

  it("routes Bigshare IPOs to the server API", async () => {
    const ipo = makeIpo({ companyName: "Technocraft Ventures Ltd", registrar: "Bigshare Services Pvt Ltd" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, results: [{ company: "Technocraft Ventures Ltd", status: "ALLOTTED", shares: "50", amount: "5000" }] }), { status: 200 }),
      ),
    );
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("ALLOTTED");
    vi.unstubAllGlobals();
  });

  it("routes Cameo IPOs to the server API for CAPTCHA solving", async () => {
    const ipo = makeIpo({ companyName: "Some Issue Ltd", registrar: "Cameo Corporate Services Ltd" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, results: [{ company: "Some Issue Ltd", status: "ALLOTTED", shares: "50", amount: "5000" }] }), {
          status: 200,
        }),
      ),
    );
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("ALLOTTED");
    vi.unstubAllGlobals();
  });
});