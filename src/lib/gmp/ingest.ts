import type { GmpAdapter, SourceObservation } from "./types";
import { providerErrorResult } from "@/lib/ingestion/provider-result";
import { withTransientRetries } from "@/lib/ingestion/source-operation";

/**
 * Runs every adapter concurrently and isolates failures per-source —
 * one adapter throwing (timeout, layout change, network error) never
 * prevents the others from reporting in. This is the fan-out half of
 * the fallback behavior; `computeGmpSnapshot` (confidence.ts) is the
 * aggregation half.
 */
export async function collectObservations(
  companyName: string,
  adapters: GmpAdapter[],
): Promise<SourceObservation[]> {
  const results = await Promise.allSettled(
    adapters.map((adapter) => withTransientRetries(() => adapter.fetchGmp(companyName))),
  );

  return results.map((result, i) => {
    const adapter = adapters[i];
    if (result.status === "fulfilled") {
      return {
        sourceKey: adapter.key,
        sourceName: adapter.name,
        ...result.value,
      };
    }
    return {
      sourceKey: adapter.key,
      sourceName: adapter.name,
      ...providerErrorResult(result.reason),
    };
  });
}

export function successfulValues(observations: SourceObservation[]): number[] {
  return observations
    .filter((o): o is SourceObservation & { kind: "VALUE" } => o.kind === "VALUE")
    .map((o) => o.value);
}
