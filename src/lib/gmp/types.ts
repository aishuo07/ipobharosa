export interface GmpAdapter {
  key: string;
  name: string;
  /** Resolves to the scraped GMP value, or throws/rejects on failure. */
  fetchGmp(companyName: string): Promise<number>;
}

export type SourceObservation =
  | { sourceKey: string; sourceName: string; success: true; value: number }
  | { sourceKey: string; sourceName: string; success: false; error: string };
