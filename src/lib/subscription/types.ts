export type SubscriptionResult = {
  qibX: number;
  niiX: number;
  retailX: number;
  employeeX: number | null;
  sourceExchange: string;
};

export interface SubscriptionAdapter {
  key: string;
  name: string;
  fetchSubscription(companyName: string): Promise<ProviderResult<SubscriptionResult>>;
}
import type { ProviderResult } from "@/lib/ingestion/provider-result";
