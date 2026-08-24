import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const KFIN_API = "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan";
const KFIN_REFERER = "https://ipostatus.kfintech.com/";

const OPERATION_KEY = "registrar:kfin:search";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const PAN = body.PAN || body.pan || body.PanNo;
    const client_id = body.client_id || body.company_code || body.companyCode;
    if (!PAN || !client_id) {
      return NextResponse.json({ error: "PAN and company_code required" }, { status: 400 });
    }
    const upstream = await fetch(KFIN_API, {
      method: "GET",
      headers: {
        reqparam: String(PAN),
        client_id: String(client_id),
        referer: KFIN_REFERER,
        Accept: "application/json, text/plain, */*",
        "User-Agent": "IPOBharosa/1.0",
      },
    });
    if (!upstream.ok) {
      const message = `Upstream HTTP ${upstream.status}`;
      await recordSourceFailure(OPERATION_KEY, "KFinTech", "allotment-pan-search", new Error(message));
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const data = await upstream.json();
    await recordSourceSuccess(OPERATION_KEY, "KFinTech", "allotment-pan-search");
    return NextResponse.json(data, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    await logApiError("registrar:search", e);
    await recordSourceFailure(OPERATION_KEY, "KFinTech", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
