export const INGESTION_FRESHNESS_LIMIT_MS = 150 * 60 * 1000;

export type PublicHealth = {
  status: "ok" | "degraded";
  checkedAt: string;
  database: "reachable" | "unreachable";
  ingestion: {
    status: "fresh" | "stale" | "missing" | "unknown";
    lastSuccessAt: string | null;
    ageMinutes: number | null;
  };
};

export function publicHealthFromLastSuccess(lastSuccessAt: Date | null, now = new Date()): PublicHealth {
  if (!lastSuccessAt) {
    return {
      status: "degraded",
      checkedAt: now.toISOString(),
      database: "reachable",
      ingestion: { status: "missing", lastSuccessAt: null, ageMinutes: null },
    };
  }

  const ageMs = Math.max(0, now.getTime() - lastSuccessAt.getTime());
  const fresh = ageMs <= INGESTION_FRESHNESS_LIMIT_MS;
  return {
    status: fresh ? "ok" : "degraded",
    checkedAt: now.toISOString(),
    database: "reachable",
    ingestion: {
      status: fresh ? "fresh" : "stale",
      lastSuccessAt: lastSuccessAt.toISOString(),
      ageMinutes: Math.round(ageMs / 60000),
    },
  };
}

export function unreachablePublicHealth(now = new Date()): PublicHealth {
  return {
    status: "degraded",
    checkedAt: now.toISOString(),
    database: "unreachable",
    ingestion: { status: "unknown", lastSuccessAt: null, ageMinutes: null },
  };
}
