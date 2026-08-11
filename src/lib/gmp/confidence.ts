export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW";

export type GmpSnapshotResult = {
  medianValue: number;
  sourceCount: number;
  maxDeviation: number;
  confidence: ConfidenceTier;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Computes a GMP snapshot from whichever sources succeeded this ingestion
 * cycle. A failed/missing source is simply absent from `values` — dropping
 * a source degrades confidence, it never breaks the calculation.
 *
 * Returns null when every source failed this cycle: callers should keep
 * serving the last snapshot rather than writing an invented value.
 */
export function computeGmpSnapshot(values: number[]): GmpSnapshotResult | null {
  if (values.length === 0) return null;

  const medianValue = median(values);
  const maxDeviation = Math.max(...values.map((v) => Math.abs(v - medianValue)));
  const spreadPct = medianValue === 0 ? 0 : maxDeviation / medianValue;

  let confidence: ConfidenceTier;
  if (values.length >= 3 && spreadPct <= 0.08) {
    confidence = "HIGH";
  } else if (values.length >= 2 && spreadPct <= 0.2) {
    confidence = "MEDIUM";
  } else {
    confidence = "LOW";
  }

  return {
    medianValue,
    sourceCount: values.length,
    maxDeviation,
    confidence,
  };
}
