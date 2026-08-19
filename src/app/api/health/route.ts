import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicHealthFromLastSuccess, unreachablePublicHealth, type PublicHealth } from "@/lib/public-health";
import { computeStoredCheckpointAlertReasons } from "@/lib/ingestion/alert";

export const dynamic = "force-dynamic";

const REGISTRAR_OPERATIONS = ["registrar:mufg:search", "registrar:kfin:search", "registrar:bigshare:search", "registrar:maashitla:search", "catalogue:kfin", "catalogue:bigshare", "catalogue:maashitla", "catalogue:mufg"];

export async function GET() {
  try {
    const [latest, unhealthyRegistrars] = await Promise.all([
      prisma.ingestionRun.findFirst({
        where: { ok: true, skippedDueToLock: false, finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true, summary: true },
      }),
      prisma.sourceOperationHealth.findMany({
        where: { key: { in: REGISTRAR_OPERATIONS }, consecutiveFailures: { gt: 0 } },
        select: { key: true, source: true, operation: true, consecutiveFailures: true, lastError: true },
      }),
    ]);
    const sourceReasons = latest ? computeStoredCheckpointAlertReasons(latest.summary) : null;
    const registrarIssueCount = unhealthyRegistrars.length;
    const body: PublicHealth & {
      registrarOperations: { status: "healthy" | "degraded" | "unknown"; failing: string[] };
    } = {
      ...publicHealthFromLastSuccess(latest?.finishedAt ?? null, new Date(), (sourceReasons?.length ?? 0) + registrarIssueCount),
      registrarOperations: {
        status: registrarIssueCount > 0 ? "degraded" : "healthy",
        failing: unhealthyRegistrars.map((entry) => `${entry.key}: ${entry.consecutiveFailures} consecutive failure(s) — ${entry.lastError ?? "no detail"}`),
      },
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
