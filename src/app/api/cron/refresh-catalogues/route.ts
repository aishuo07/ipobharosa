import { NextResponse } from "next/server";
import { refreshCatalogue, getCatalogue } from "@/lib/allotment-core/catalogue";
import type { RegistrarKey } from "@/lib/allotment-core/catalogue/types";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const CRON_SECRET = process.env.CRON_SECRET;

const REGISTRARS: RegistrarKey[] = ["kfin", "bigshare", "maashitla", "mufg"];

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (process.env.NODE_ENV === "production") {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
    }
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results: { registrar: RegistrarKey; ok: boolean; count: number; error?: string }[] = [];
  for (const registrar of REGISTRARS) {
    const key = `catalogue:${registrar}`;
    try {
      await refreshCatalogue(registrar);
      const companies = await getCatalogue(registrar);
      await recordSourceSuccess(key, `registrar-${registrar}`, "catalogue-refresh");
      results.push({ registrar, ok: true, count: companies.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await recordSourceFailure(key, `registrar-${registrar}`, "catalogue-refresh", error);
      results.push({ registrar, ok: false, count: 0, error: message });
    }
  }

  const ok = results.every((result) => result.ok);
  return NextResponse.json(
    { success: ok, results },
    { status: ok ? 200 : 500 },
  );
}