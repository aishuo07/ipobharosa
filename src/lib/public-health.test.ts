import { describe, expect, it } from "vitest";
import {
  INGESTION_FRESHNESS_LIMIT_MS,
  publicHealthFromLastSuccess,
  unreachablePublicHealth,
} from "./public-health";

describe("public health contract", () => {
  const now = new Date("2026-08-17T05:00:00.000Z");

  it("reports a recent successful ingestion as healthy", () => {
    const result = publicHealthFromLastSuccess(new Date(now.getTime() - 30 * 60 * 1000), now);
    expect(result).toMatchObject({
      status: "ok",
      database: "reachable",
      ingestion: { status: "fresh", ageMinutes: 30 },
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
    });
  });
});
