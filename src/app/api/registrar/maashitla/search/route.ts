import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const MAASHITLA_API = "https://api.maashitla.com";

const OPERATION_KEY = "registrar:maashitla:search";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pan = body.PAN || body.pan;
    const company_name = body.company_code || body.companyCode || body.Company;
    if (!pan) {
      return NextResponse.json({ error: "PAN required" }, { status: 400 });
    }
    const url = company_name
      ? `${MAASHITLA_API}/api/public-issue/search?company_name=${encodeURIComponent(company_name)}&pan=${encodeURIComponent(pan)}`
      : `${MAASHITLA_API}/api/public-issue/search?pan=${encodeURIComponent(pan)}`;
    const upstream = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "IPOBharosa/1.0" },
    });
    if (!upstream.ok) {
      const message = `Upstream HTTP ${upstream.status}`;
      await recordSourceFailure(OPERATION_KEY, "Maashitla", "allotment-pan-search", new Error(message));
      return NextResponse.json({ ok: false, error: message, upstream: true });
    }
    const data = await upstream.json();
    await recordSourceSuccess(OPERATION_KEY, "Maashitla", "allotment-pan-search");
    return NextResponse.json(data, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    await logApiError("registrar:search", e);
    await recordSourceFailure(OPERATION_KEY, "Maashitla", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const company_name = searchParams.get("company_name");
    const pan = searchParams.get("pan");
    if (!company_name || !pan) {
      return NextResponse.json({ error: "company_name and pan required" }, { status: 400 });
    }
    const upstream = await fetch(
      `${MAASHITLA_API}/api/public-issue/search?company_name=${encodeURIComponent(company_name)}&pan=${encodeURIComponent(pan)}`,
      {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "IPOBharosa/1.0" },
      },
    );
    if (!upstream.ok) {
      const message = `Upstream HTTP ${upstream.status}`;
      await recordSourceFailure(OPERATION_KEY, "Maashitla", "allotment-pan-search", new Error(message));
      return NextResponse.json({ ok: false, error: message, upstream: true });
    }
    const data = await upstream.json();
    await recordSourceSuccess(OPERATION_KEY, "Maashitla", "allotment-pan-search");
    return NextResponse.json(data, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    await logApiError("registrar:search", e);
    await recordSourceFailure(OPERATION_KEY, "Maashitla", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
