import { describe, expect, it } from "vitest";
import type { OfficialIpoSource } from "@/lib/discovery/official/types";
import { createNseSubscriptionAdapter } from "./nse";

function source(result: Awaited<ReturnType<OfficialIpoSource["findEvidence"]>>): OfficialIpoSource {
  return { source: "NSE", findEvidence: async () => result };
}

describe("NSE subscription adapter", () => {
  it("returns direct official demand with nullable categories", async () => {
    const adapter = createNseSubscriptionAdapter(source({
      status: "FOUND",
      evidence: {
        source: "NSE", sourceUrl: "https://www.nseindia.com/issue", capturedAt: new Date(),
        facts: { companyName: "Example", board: "MAINBOARD", priceBandLow: 1, priceBandHigh: 2, lotSize: 1, openDate: new Date(), closeDate: new Date(), registrar: "Registrar", leadManagers: [], rhpUrl: "https://nsearchives.nseindia.com/rhp.pdf" },
        fieldSources: {}, raw: {},
        enrichment: { issueType: "IPO", symbol: "EX", faceValue: null, issueSizeShares: null, marketLot: 1, minimumBidQuantity: 1, maximumRetailAmount: null, maximumEmployeeAmount: null, maximumQibQuantity: null, maximumNiiQuantity: null, employeeDiscount: null, issueSizeDescription: null, marketTimings: null, upiMandateCutoff: null, sponsorBanks: [], documents: [], demand: { qibX: null, niiX: 2, retailX: 3, employeeX: null, totalX: 2.5, capturedAt: new Date(), sourceUrl: "https://www.nseindia.com/issue" } },
      },
    }));
    expect(await adapter.fetchSubscription("Example")).toEqual({ kind: "VALUE", value: { qibX: null, niiX: 2, retailX: 3, employeeX: null, sourceExchange: "nse-official" } });
  });

  it("distinguishes unavailable, uncovered and not-yet-published demand", async () => {
    expect(await createNseSubscriptionAdapter(source({ status: "UNAVAILABLE", reason: "NSE HTTP 503" })).fetchSubscription("Example")).toMatchObject({ kind: "ERROR", retryable: true });
    expect(await createNseSubscriptionAdapter(source({ status: "NOT_FOUND", reason: "missing" })).fetchSubscription("Example")).toEqual({ kind: "NOT_COVERED", reason: "missing" });
    const noDemand = source({ status: "FOUND", evidence: { source: "NSE", sourceUrl: "https://www.nseindia.com/issue", capturedAt: new Date(), facts: { companyName: "Example", board: null, priceBandLow: null, priceBandHigh: null, lotSize: null, openDate: null, closeDate: null, registrar: null, leadManagers: [], rhpUrl: null }, fieldSources: {}, raw: {}, enrichment: { issueType: "IPO", symbol: null, faceValue: null, issueSizeShares: null, marketLot: null, minimumBidQuantity: null, maximumRetailAmount: null, maximumEmployeeAmount: null, maximumQibQuantity: null, maximumNiiQuantity: null, employeeDiscount: null, issueSizeDescription: null, marketTimings: null, upiMandateCutoff: null, sponsorBanks: [], documents: [], demand: null } } });
    expect(await createNseSubscriptionAdapter(noDemand).fetchSubscription("Example")).toMatchObject({ kind: "NOT_YET_AVAILABLE" });
  });
});
