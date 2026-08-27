import { describe, expect, it } from "vitest";
import {
  INGESTION_FRESHNESS_LIMIT_MS,
  publicHealthFromLastSuccess,
  unreachablePublicHealth,
} from "./public-health";

describe("public health contract", () => {
  const now = new Date("2026-08-17T05:00:00.000Z");

  it("reports a recent successful ingestion as healthy", () => {
    const result = publicHealthFromLastSuccess(new Date(now.getTime() - 30 * 60 * 1000), now, 0);
    expect(result).toMatchObject({
      status: "ok",
      database: "reachable",
      ingestion: { status: "fresh", ageMinutes: 30 },
      sourcePipeline: { status: "healthy", issueCount: 0 },
    });
  });

  it("degrades a fresh run when its source pipeline reported real failures", () => {
    const result = publicHealthFromLastSuccess(new Date(now.getTime() - 10 * 60 * 1000), now, 2);
    expect(result).toMatchObject({
      status: "degraded",
      ingestion: { status: "fresh" },
      sourcePipeline: { status: "degraded", issueCount: 2 },
    });
  });

  it("degrades after two expected hourly cycles plus buffer", () => {
    const result = publicHealthFromLastSuccess(new Date(now.getTime() - INGESTION_FRESHNESS_LIMIT_MS - 1), now);
    expect(result.status).toBe("degraded");
    expect(result.ingestion.status).toBe("stale");
  });

  it("fails closed when no successful run exists", () => {
    expect(publicHealthFromLastSuccess(null, now)).toMatchObject({
      status: "degraded",
      database: "reachable",
      ingestion: { status: "missing", lastSuccessAt: null },
    });
  });

  it("does not leak an internal database error", () => {
    expect(unreachablePublicHealth(now)).toEqual({
      status: "degraded",
      checkedAt: now.toISOString(),
      database: "unreachable",
      ingestion: { status: "unknown", lastSuccessAt: null, ageMinutes: null },
      sourcePipeline: { status: "unknown", issueCount: null },
    });
  });
});
