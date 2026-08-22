import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicHealthFromLastSuccess, unreachablePublicHealth, type PublicHealth } from "@/lib/public-health";
import { computeStoredCheckpointAlertReasons } from "@/lib/ingestion/alert";

export const dynamic = "force-dynamic";

const REGISTRAR_OPERATIONS = ["registrar:mufg:search", "registrar:kfin:search", "registrar:bigshare:search", "registrar:maashitla:search", "catalogue:kfin", "catalogue:bigshare", "catalogue:maashitla", "catalogue:mufg"];

export async function GET() {
  try {
    const [latest, latestAttempt, unhealthyRegistrars] = await Promise.all([
      prisma.ingestionRun.findFirst({
        where: { ok: true, skippedDueToLock: false, finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true, summary: true },
      }),
      prisma.ingestionRun.findFirst({
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, finishedAt: true, ok: true, skippedDueToLock: true, error: true, summary: true },
      }),
      prisma.sourceOperationHealth.findMany({
        where: { key: { in: REGISTRAR_OPERATIONS }, consecutiveFailures: { gt: 0 } },
        select: { key: true, source: true, operation: true, consecutiveFailures: true, lastError: true },
      }),
    ]);

        const sourceReasons = latest ? computeStoredCheckpointAlertReasons(latest.summary) : null;
        const sourceIssueCount = sourceReasons?.filter((r) => !r.includes("drift")).length ?? 0;
        const registrarIssueCount = unhealthyRegistrars.length;
    const latestSummary = latestAttempt?.summary && typeof latestAttempt.summary === "object"
      ? latestAttempt.summary as Record<string, unknown>
      : null;

    const body: PublicHealth & {
      lastRun: {
        startedAt: string | null;
        finishedAt: string | null;
        ok: boolean;
        skipped: boolean;
        stage: string;
        ipoCount: number;
        error: string | null;
      };
      registrarOperations: { status: "healthy" | "degraded" | "unknown"; failing: string[] };
      alertReasons: string[];
    } = {
      ...publicHealthFromLastSuccess(latest?.finishedAt ?? null, new Date(), sourceIssueCount + registrarIssueCount),
      lastRun: {
        startedAt: latestAttempt?.startedAt?.toISOString() ?? null,
        finishedAt: latestAttempt?.finishedAt?.toISOString() ?? null,
        ok: latestAttempt?.ok ?? false,
        skipped: latestAttempt?.skippedDueToLock ?? false,
        stage: (latestSummary?.stage as string) ?? "unknown",
        ipoCount: (latestSummary?.ipoCount as number) ?? 0,
        error: latestAttempt?.error ?? null,
      },
      registrarOperations: {
        status: registrarIssueCount > 0 ? "degraded" : "healthy",
        failing: unhealthyRegistrars.map((entry) => `${entry.key}: ${entry.consecutiveFailures} consecutive failure(s) — ${entry.lastError ?? "no detail"}`),
      },
      alertReasons: sourceReasons ?? [],
    };
    return NextResponse.json(body, {
      status: body.status === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(unreachablePublicHealth(), {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
