import { execSync } from "child_process";
import { NextResponse } from "next/server";

let ran = false;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const secret = body.secret || "";
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (ran) {
    return NextResponse.json({ ok: true, note: "already ran this cold start" });
  }
  ran = true;
  try {
    const out = execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      timeout: 30_000,
      encoding: "utf-8",
    });
    return NextResponse.json({ ok: true, output: out.trim() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
