import { describe, expect, it } from "vitest";
import { registrarCheck } from "@/src/lib/allotment";
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