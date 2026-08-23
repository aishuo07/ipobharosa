import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://ipobharosa.vercel.app";

  const endpoints = [
    { name: "health", url: "/api/health" },
    { name: "monitor", url: "/api/admin/monitor" },
  ];

  const checkSingle = async (ep: { name: string; url: string }) => {
    const start = Date.now();
    try {
      const res = await fetch(`${base}${ep.url}`, {
        signal: AbortSignal.timeout(15000),
      });
      return { name: ep.name, ok: res.ok, status: res.status, durationMs: Date.now() - start };
    } catch (e) {
      return { name: ep.name, ok: false, status: 0, durationMs: Date.now() - start, error: (e as Error).message };
    }
  };

  const results = await Promise.all(endpoints.map(checkSingle));
  const checks = Object.fromEntries(results.map((r) => [r.name, { ok: r.ok, status: r.status, durationMs: r.durationMs, ...(r.error ? { error: r.error } : {}) }]));
  const allOk = results.every((r) => r.ok);

  return NextResponse.json({ ok: allOk, checkedAt: new Date().toISOString(), checks });
}
