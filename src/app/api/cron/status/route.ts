import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [latestRun, recentRuns, sourceHealth, registrarHealth] = await Promise.all([
      prisma.ingestionRun.findFirst({
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          startedAt: true,
          finishedAt: true,
          ok: true,
          skippedDueToLock: true,
          error: true,
          summary: true,
        },
      }),
      prisma.ingestionRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 10,
        select: {
          id: true,
          startedAt: true,
          finishedAt: true,
          ok: true,
          skippedDueToLock: true,
          error: true,
        },
      }),
      prisma.sourceHealth.findMany({
        orderBy: { lastSuccessAt: "desc" },
        take: 20,
        select: {
          sourceId: true,
          lastSuccessAt: true,
          lastError: true,
          consecutiveFailures: true,
          degraded: true,
        },
      }),
      prisma.sourceOperationHealth.findMany({
        where: { consecutiveFailures: { gt: 0 } },
        select: {
          key: true,
          source: true,
          operation: true,
          consecutiveFailures: true,
          lastError: true,
          lastAttemptAt: true,
        },
      }),
    ]);

    const summary = latestRun?.summary && typeof latestRun.summary === "object"
      ? latestRun.summary as Record<string, unknown>
      : null;

    return NextResponse.json({
      latestRun: latestRun ? {
        id: latestRun.id,
        startedAt: latestRun.startedAt,
        finishedAt: latestRun.finishedAt,
        ok: latestRun.ok,
        skippedDueToLock: latestRun.skippedDueToLock,
        error: latestRun.error,
        currentStage: summary?.stage ?? "unknown",
        ipoCount: summary?.ipoCount ?? 0,
        attempts: summary?.attempts ?? 0,
        gmp: summary?.gmp ?? {},
        subscription: summary?.subscription ?? {},
      } : null,
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        ok: r.ok,
        skipped: r.skippedDueToLock,
        error: r.error,
      })),
      sourceHealth: sourceHealth.map((s) => ({
        source: s.sourceId,
        lastSuccess: s.lastSuccessAt,
        lastError: s.lastError,
        failures: s.consecutiveFailures,
        degraded: s.degraded,
      })),
      registrarHealth: registrarHealth.map((r) => ({
        key: r.key,
        source: r.source,
        failures: r.consecutiveFailures,
        lastError: r.lastError,
        lastAttempt: r.lastAttemptAt,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
