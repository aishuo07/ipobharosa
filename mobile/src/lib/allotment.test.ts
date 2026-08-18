import { describe, expect, it, vi } from "vitest";
import {
  checkAllotmentForPans,
  registrarCheck,
  registrarKind,
} from "@/src/lib/allotment";
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

function mockServerResponse(data: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(data), { status: 200 })));
}

describe("registrarCheck", () => {
  it("flags MUFG / Link Intime as automatable", () => {
    expect(registrarCheck(makeIpo({ registrar: "MUFG Intime India Pvt Ltd" }))).toEqual({
      automatable: true,
      portalUrl: "https://linkintime.co.in/initial_offer/public-issues.html",
    });
  });

  it("flags KFinTech as automatable via its public API", () => {
    expect(registrarCheck(makeIpo({ registrar: "KFin Technologies Ltd" }))).toEqual({
      automatable: true,
      portalUrl: "https://ipostatus.kfintech.com",
    });
  });

  it("flags Bigshare as automatable via its JSON API", () => {
    expect(registrarCheck(makeIpo({ registrar: "Bigshare Services Pvt Ltd" }))).toEqual({
      automatable: true,
      portalUrl: "https://ipo.bigshareonline.com/ipo_status.html",
    });
  });

  it("classifies registrar kinds for dispatching", () => {
    expect(registrarKind(makeIpo({ registrar: "MUFG Intime India Pvt Ltd" }))).toBe("mufg");
    expect(registrarKind(makeIpo({ registrar: "KFin Technologies Ltd" }))).toBe("kfintech");
    expect(registrarKind(makeIpo({ registrar: "Bigshare Services Pvt Ltd" }))).toBe("bigshare");
    expect(registrarKind(makeIpo({ registrar: "Cameo Corporate Services Ltd" }))).toBe("manual");
  });

  it("flags CAPTCHA-gated registrars as non-automatable with a portal link", () => {
    expect(registrarCheck(makeIpo({ registrar: "Cameo Corporate Services Ltd" }))).toEqual({
      automatable: false,
      portalUrl: "https://ipostatus.cameoindia.com",
    });
  });

  it("falls back to the BSE portal for unknown registrars", () => {
    expect(registrarCheck(makeIpo({ registrar: "Some Other Registrar" }))).toEqual({
      automatable: false,
      portalUrl: "https://www.bseindia.com/investors/appli_check.aspx",
    });
  });
});

describe("checkAllotmentForPans (delegates to server)", () => {
  it("returns ALLOTTED results from the server", async () => {
    const ipo = makeIpo({ companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd." });
    mockServerResponse([
      { pan: "HFQPK9233H", companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd.", status: "ALLOTTED", allotted: "52", applicant: "AISH KANODIA", applied: "154", checkedAt: "2026-08-20T00:00:00.000Z" },
    ]);
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("ALLOTTED");
    expect(results[0].applicant).toBe("AISH KANODIA");
    expect(results[0].allotted).toBe("52");
    vi.unstubAllGlobals();
  });

  it("returns NOT_ALLOTTED results from the server", async () => {
    const ipo = makeIpo({ companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd." });
    mockServerResponse([
      { pan: "HFQPK9233H", companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd.", status: "NOT_ALLOTTED", allotted: "0", checkedAt: "2026-08-20T00:00:00.000Z" },
    ]);
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("NOT_ALLOTTED");
    expect(results[0].allotted).toBe("0");
    vi.unstubAllGlobals();
  });

  it("returns NOT_APPLIED results from the server", async () => {
    const ipo = makeIpo({ companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd." });
    mockServerResponse([
      { pan: "HFQPK9233H", companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd.", status: "NOT_APPLIED", checkedAt: "2026-08-20T00:00:00.000Z" },
    ]);
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("NOT_APPLIED");
    vi.unstubAllGlobals();
  });

  it("returns ERROR results when the company is missing from the registrar catalogue", async () => {
    const ipo = makeIpo({ companyName: "Not In Catalogue Ltd", registrar: "Kfin Technologies Ltd." });
    mockServerResponse([
      { pan: "HFQPK9233H", companyName: "Not In Catalogue Ltd", registrar: "Kfin Technologies Ltd.", status: "ERROR", error: "Company not found in KFinTech list (allotment may not be out yet)", checkedAt: "2026-08-20T00:00:00.000Z" },
      { pan: "ABCDE1234F", companyName: "Not In Catalogue Ltd", registrar: "Kfin Technologies Ltd.", status: "ERROR", error: "Company not found in KFinTech list (allotment may not be out yet)", checkedAt: "2026-08-20T00:00:00.000Z" },
    ]);
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H", "ABCDE1234F"]);
    expect(results.every((r) => r.status === "ERROR" && r.error)).toBe(true);
    expect(results).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("returns ERROR for non-automatable registrars", async () => {
    const ipo = makeIpo({ companyName: "Some Issue Ltd", registrar: "Cameo Corporate Services Ltd" });
    mockServerResponse([
      { pan: "HFQPK9233H", companyName: "Some Issue Ltd", registrar: "Cameo Corporate Services Ltd", status: "ERROR", error: "Automatic checking is not supported for Cameo Corporate Services Ltd. Open the registrar's portal instead.", checkedAt: "2026-08-20T00:00:00.000Z" },
    ]);
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("ERROR");
    expect(results[0].error).toContain("not supported");
    vi.unstubAllGlobals();
  });

  it("returns an empty list when there are no PANs", async () => {
    const ipo = makeIpo({ companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd." });
    const results = await checkAllotmentForPans(ipo, []);
    expect(results).toEqual([]);
  });

  it("reports ERROR when the server returns 500", async () => {
    const ipo = makeIpo({ companyName: "Shiprocket Ltd", registrar: "Kfin Technologies Ltd." });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 })));
    const results = await checkAllotmentForPans(ipo, ["HFQPK9233H"]);
    expect(results[0].status).toBe("ERROR");
    expect(results[0].error).toContain("Server allotment check failed");
    vi.unstubAllGlobals();
  });
});
