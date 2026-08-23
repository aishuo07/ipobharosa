import { NextResponse } from "next/server";

export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET || "";
const BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://ipobharosa.vercel.app";

const ROUTES: Record<string, string> = {
  ingest: "/api/cron/ingest",
  push: "/api/cron/daily-push",
  allotment: "/api/cron/allotment-launch",
  filings: "/api/cron/filing-evidence",
  catalogues: "/api/cron/refresh-catalogues",
};

export async function GET(req: Request) {
  return runTrigger(req);
}

export async function POST(req: Request) {
  return runTrigger(req);
}

async function runTrigger(req: Request) {
  const url = new URL(req.url);
  const jobsParam = url.searchParams.get("jobs") || "all";

  const selected =
    jobsParam === "all"
      ? Object.keys(ROUTES)
      : jobsParam.split(",").filter((j) => ROUTES[j]);

  const results: Record<string, { ok: boolean; status: number; error?: string }> = {};

  for (const name of selected) {
    try {
      const res = await fetch(`${BASE}${ROUTES[name]}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      results[name] = { ok: res.ok, status: res.status };
    } catch (e) {
      results[name] = { ok: false, status: 0, error: (e as Error).message };
    }
  }

  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results });
}
