import { NseOfficialSource } from "@/lib/discovery/official/nse";
import type { OfficialIpoSource } from "@/lib/discovery/official/types";
import { providerErrorResult } from "@/lib/ingestion/provider-result";
import type { SubscriptionAdapter } from "../types";

export function createNseSubscriptionAdapter(source: OfficialIpoSource): SubscriptionAdapter {
  return {
    key: "nse-subscription",
    name: "NSE official issue demand",
    async fetchSubscription(companyName) {
      const result = await source.findEvidence(companyName);
      if (result.status === "UNAVAILABLE") return providerErrorResult(new Error(result.reason));
      if (result.status === "NOT_FOUND" || result.status === "WRONG_ISSUE_TYPE") return { kind: "NOT_COVERED", reason: result.reason };
      const demand = result.evidence.enrichment?.demand;
      if (!demand || [demand.qibX, demand.niiX, demand.retailX, demand.employeeX, demand.totalX].every((value) => value === null)) {
        return { kind: "NOT_YET_AVAILABLE", reason: `NSE has not published a demand snapshot for ${companyName} yet` };
      }
      return {
        kind: "VALUE",
        value: { qibX: demand.qibX, niiX: demand.niiX, retailX: demand.retailX, employeeX: demand.employeeX, sourceExchange: "nse-official" },
      };
    },
  };
}

export const nseSubscriptionAdapter = createNseSubscriptionAdapter(new NseOfficialSource());
