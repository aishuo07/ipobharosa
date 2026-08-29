import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";
import { findKfinClientId } from "@/lib/kfin-companies";

const KFIN_API = "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan";
const KFIN_REFERER = "https://ipostatus.kfintech.com/";
const OPERATION_KEY = "registrar:kfin:search";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const PAN = body.PAN || body.pan;
    const companyName = body.company_name || body.companyName || body.company_code || "";
    if (!PAN || !companyName) {
      return NextResponse.json({ ok: false, error: "PAN and company_name required" }, { status: 400 });
    }

    const clientId = findKfinClientId(companyName);
    if (!clientId) {
      return NextResponse.json({ ok: false, error: `Company "${companyName}" not found in KFin list` });
    }

    const upstream = await fetch(KFIN_API, {
      method: "GET",
      headers: {
        reqparam: PAN.toUpperCase(),
        client_id: clientId,
        Referer: KFIN_REFERER,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Access-Control-Allow-Origin": "*",
      },
    });

    if (!upstream.ok) {
      await recordSourceFailure(OPERATION_KEY, "KFinTech", "allotment-pan-search", new Error(`KFin API HTTP ${upstream.status}`));
      return NextResponse.json({ ok: false, error: `KFin API returned HTTP ${upstream.status}` }, { status: 502 });
    }

    const data = await upstream.json();
    const results = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

    if (results.length === 0) {
      return NextResponse.json({ ok: true, registrar: "kfin", pan: PAN, results: [], note: "No application found" });
    }

    await recordSourceSuccess(OPERATION_KEY, "KFinTech", "allotment-pan-search");
    return NextResponse.json({ ok: true, registrar: "kfin", pan: PAN, results });
  } catch (e) {
    await logApiError("registrar:kfin", e);
    await recordSourceFailure(OPERATION_KEY, "KFinTech", "allotment-pan-search", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
  }
}
