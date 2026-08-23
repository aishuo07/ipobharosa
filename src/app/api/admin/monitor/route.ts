import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeAlertReasons, computeStoredCheckpointAlertReasons } from "@/lib/ingestion/alert";
import { getEmailReadiness } from "@/lib/email/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();

    const [latestRun, recentRuns, sourceHealth, ipoStats, emailReady] = await Promise.all([
      prisma.ingestionRun.findFirst({
        where: { ok: true, skippedDueToLock: false, finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" },
        select: { id: true, finishedAt: true, summary: true, startedAt: true },
      }),
      prisma.ingestionRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 10,
        select: { id: true, ok: true, error: true, startedAt: true, finishedAt: true, skippedDueToLock: true, summary: true },
      }),
      prisma.sourceOperationHealth.findMany({
        orderBy: { consecutiveFailures: "desc" },
        select: { key: true, source: true, operation: true, consecutiveFailures: true, lastSuccessAt: true, lastError: true },
      }),
      prisma.ipo.groupBy({
        by: ["status", "publicationState"],
        _count: true,
      }),
      getEmailReadiness(),
    ]);

    const latestSummary = latestRun?.summary as Record<string, unknown> | null;
    const alertReasons = latestSummary ? computeStoredCheckpointAlertReasons(latestSummary) : null;
    const sourceIssueCount = alertReasons?.filter((r) => !r.includes("drift")).length ?? 0;

    const lastRunAge = latestRun?.finishedAt
      ? Math.round((now.getTime() - new Date(latestRun.finishedAt).getTime()) / 60000)
      : null;

    const healthy = sourceIssueCount === 0 && lastRunAge !== null && lastRunAge < 120;

    const statusByState: Record<string, number> = {};
    for (const row of ipoStats) {
      statusByState[`${row.publicationState}:${row.status}`] = row._count;
    }

    return NextResponse.json({
      ok: true,
      healthy,
      checkedAt: now.toISOString(),
      pipeline: {
        lastSuccessAt: latestRun?.finishedAt?.toISOString() ?? null,
        lastRunAgeMinutes: lastRunAge,
        sourceIssues: sourceIssueCount,
        alertReasons: alertReasons ?? [],
      },
      recentRuns: recentRuns.map((r) => ({
        id: r.id.substring(0, 8),
        ok: r.ok,
        skipped: r.skippedDueToLock,
        error: r.error,
        startedAt: r.startedAt?.toISOString(),
        finishedAt: r.finishedAt?.toISOString(),
      })),
      sourceHealth: sourceHealth.map((s) => ({
        key: s.key,
        source: s.source,
        operation: s.operation,
        consecutiveFailures: s.consecutiveFailures,
        lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
        lastError: s.lastError,
      })),
      ipoStats: statusByState,
      email: {
        transportReady: emailReady.transportReady,
        enabled: emailReady.enabled,
        reasons: emailReady.reasons,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
