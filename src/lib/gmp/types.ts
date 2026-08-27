import type { ProviderResult } from "@/lib/ingestion/provider-result";

export interface GmpAdapter {
  key: string;
  name: string;
  /** Expected absence is data, not an exception. Throw only on real source errors. */
  fetchGmp(companyName: string): Promise<ProviderResult<number>>;
}

export type SourceObservation = { sourceKey: string; sourceName: string } & ProviderResult<number>;
