export type PublicSignalAvailability = {
  kind: "VALUE" | "NOT_YET_AVAILABLE" | "NOT_COVERED" | "ERROR" | "UNKNOWN";
  checkedAt: string | null;
  checkedSources: number;
};

type AvailabilityObservation = {
  sourceKey: string;
  success: boolean;
  errorMessage: string | null;
  capturedAt: Date;
};

export function deriveGmpAvailability(observations: AvailabilityObservation[]): PublicSignalAvailability {
  const latestBySource = new Map<string, AvailabilityObservation>();
  for (const observation of observations) {
    if (!latestBySource.has(observation.sourceKey)) latestBySource.set(observation.sourceKey, observation);
  }
  const latest = [...latestBySource.values()];
  const checkedAt = latest.length
    ? new Date(Math.max(...latest.map((value) => value.capturedAt.getTime()))).toISOString()
    : null;
  const base = { checkedAt, checkedSources: latest.length };
  if (latest.some((value) => value.success)) return { kind: "VALUE", ...base };
  if (latest.some((value) => value.errorMessage?.startsWith("[ERROR:"))) return { kind: "ERROR", ...base };
  if (latest.some((value) => value.errorMessage?.startsWith("[NOT_YET_AVAILABLE]"))) return { kind: "NOT_YET_AVAILABLE", ...base };
  if (latest.length > 0 && latest.every((value) => value.errorMessage?.startsWith("[NOT_COVERED]"))) return { kind: "NOT_COVERED", ...base };
  if (latest.some((value) => value.errorMessage && !value.errorMessage.startsWith("[NOT_"))) return { kind: "ERROR", ...base };
  return { kind: "UNKNOWN", ...base };
}
