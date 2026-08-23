import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: Record<string, { ok: boolean; status?: number; durationMs?: number; error?: string }> = {};

  const endpoints = [
    { name: "health", url: "/api/health" },
    { name: "ingest", url: "/api/cron/ingest" },
    { name: "allotment", url: "/api/cron/allotment-launch" },
    { name: "catalogues", url: "/api/cron/refresh-catalogues" },
    { name: "filing-evidence", url: "/api/cron/filing-evidence" },
    { name: "daily-push", url: "/api/cron/daily-push" },
  ];

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://ipobharosa.vercel.app";

  for (const ep of endpoints) {
    const start = Date.now();
    try {
      const res = await fetch(`${base}${ep.url}`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
        signal: AbortSignal.timeout(30000),
      });
      checks[ep.name] = { ok: res.ok, status: res.status, durationMs: Date.now() - start };
    } catch (e) {
      checks[ep.name] = { ok: false, status: 0, durationMs: Date.now() - start, error: (e as Error).message };
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json({ ok: allOk, checkedAt: new Date().toISOString(), checks });
}
