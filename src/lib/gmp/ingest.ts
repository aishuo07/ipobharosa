import type { GmpAdapter, SourceObservation } from "./types";

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
    adapters.map((adapter) => adapter.fetchGmp(companyName)),
  );

  return results.map((result, i) => {
    const adapter = adapters[i];
    if (result.status === "fulfilled") {
      return {
        sourceKey: adapter.key,
        sourceName: adapter.name,
        success: true,
        value: result.value,
      };
    }
    return {
      sourceKey: adapter.key,
      sourceName: adapter.name,
      success: false,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    };
  });
}

export function successfulValues(observations: SourceObservation[]): number[] {
  return observations
    .filter((o): o is SourceObservation & { success: true } => o.success)
    .map((o) => o.value);
}
