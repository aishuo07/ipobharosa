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
  sourcePipeline: {
    status: "healthy" | "degraded" | "unknown";
    issueCount: number | null;
  };
};

export function publicHealthFromLastSuccess(
  lastSuccessAt: Date | null,
  now = new Date(),
  sourceIssueCount: number | null = null,
): PublicHealth {
  const sourcePipeline = sourceIssueCount === null
    ? { status: "unknown" as const, issueCount: null }
    : { status: sourceIssueCount > 0 ? "degraded" as const : "healthy" as const, issueCount: sourceIssueCount };
  if (!lastSuccessAt) {
    return {
      status: "degraded",
      checkedAt: now.toISOString(),
      database: "reachable",
      ingestion: { status: "missing", lastSuccessAt: null, ageMinutes: null },
      sourcePipeline,
    };
  }

  const ageMs = Math.max(0, now.getTime() - lastSuccessAt.getTime());
  const fresh = ageMs <= INGESTION_FRESHNESS_LIMIT_MS;
  return {
    status: fresh && sourcePipeline.status !== "degraded" ? "ok" : "degraded",
    checkedAt: now.toISOString(),
    database: "reachable",
    ingestion: {
      status: fresh ? "fresh" : "stale",
      lastSuccessAt: lastSuccessAt.toISOString(),
      ageMinutes: Math.round(ageMs / 60000),
    },
    sourcePipeline,
  };
}

export function unreachablePublicHealth(now = new Date()): PublicHealth {
  return {
    status: "degraded",
    checkedAt: now.toISOString(),
    database: "unreachable",
    ingestion: { status: "unknown", lastSuccessAt: null, ageMinutes: null },
    sourcePipeline: { status: "unknown", issueCount: null },
  };
}
