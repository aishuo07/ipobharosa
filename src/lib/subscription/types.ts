export type SubscriptionResult = {
  qibX: number | null;
  niiX: number | null;
  retailX: number | null;
  employeeX: number | null;
  sourceExchange: string;
};

export interface SubscriptionAdapter {
  key: string;
  name: string;
  fetchSubscription(companyName: string): Promise<ProviderResult<SubscriptionResult>>;
}
import type { ProviderResult } from "@/lib/ingestion/provider-result";
