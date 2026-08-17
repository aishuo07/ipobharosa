import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicHealthFromLastSuccess, unreachablePublicHealth } from "@/lib/public-health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const latest = await prisma.ingestionRun.findFirst({
      where: { ok: true, skippedDueToLock: false, finishedAt: { not: null } },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    const body = publicHealthFromLastSuccess(latest?.finishedAt ?? null);
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
