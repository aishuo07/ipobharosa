import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const KFIN_API = "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan";
const KFIN_CATALOGUE = "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=list";
const KFIN_REFERER = "https://ipostatus.kfintech.com/";
const OPERATION_KEY = "registrar:kfin:search";

async function findClientId(companyName: string): Promise<string | null> {
  try {
    const res = await fetch(KFIN_CATALOGUE, {
      headers: { referer: KFIN_REFERER, Accept: "application/json", "User-Agent": "IPOBharosa/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.data || data?.Table || [];
    const match = list.find((c: Record<string, string>) =>
      (c.COMPANY_NAME || c.company_name || c.Name || "").toLowerCase().includes(companyName.toLowerCase())
    );
    return match?.CLIENT_ID || match?.client_id || match?.Id || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const PAN = body.PAN || body.pan;
    const companyName = body.company_name || body.companyName || body.company_code || "";
    if (!PAN || !companyName) {
      return NextResponse.json({ ok: false, error: "PAN and company_name required" }, { status: 400 });
    }
    const clientId = await findClientId(companyName);
    if (!clientId) {
      return NextResponse.json({ ok: false, error: `Company "${companyName}" not found in KFin catalogue` });
    }
    const upstream = await fetch(KFIN_API, {
      method: "GET",
      headers: { reqparam: PAN, client_id: clientId, referer: KFIN_REFERER, Accept: "application/json", "User-Agent": "IPOBharosa/1.0" },
    });
    const data = await upstream.json();
    await recordSourceSuccess(OPERATION_KEY, "KFinTech", "allotment-pan-search");
    const results = Array.isArray(data) ? data : data?.data || data?.Table || [];
    return NextResponse.json({ ok: true, registrar: "kfin", results }, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    await logApiError("registrar:kfin", e);
    await recordSourceFailure(OPERATION_KEY, "KFinTech", "allotment-pan-search", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
  }
}
