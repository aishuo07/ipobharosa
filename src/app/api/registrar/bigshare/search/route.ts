import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const BIGSHARE_ENDPOINT = "https://ipo.bigshareonline.com/Data.aspx/FetchIpodetails";
const BIGSHARE_LIST = "https://ipo.bigshareonline.com/Data.aspx/GetIPOList";
const OPERATION_KEY = "registrar:bigshare:search";

function headers() {
  return {
    "User-Agent": "IPOBharosa/1.0",
    "Content-Type": "application/json; charset=utf-8",
    "X-Requested-With": "XMLHttpRequest",
    Origin: "https://ipo.bigshareonline.com",
    Referer: "https://ipo.bigshareonline.com/ipo_status.html",
    Accept: "application/json",
  };
}

async function findCompanyId(companyName: string): Promise<string | null> {
  try {
    const res = await fetch(BIGSHARE_LIST, { method: "POST", headers: headers(), body: "{}" });
    if (!res.ok) return null;
    const data = await res.json();
    const items = Array.isArray(data) ? data : data?.d ? JSON.parse(data.d) : [];
    const match = items.find((c: Record<string, string>) =>
      (c.COMPANY_NAME || c.CompanyName || c.Name || "").toLowerCase().includes(companyName.toLowerCase())
    );
    return match?.COMPANY_ID || match?.CompanyId || match?.Id || null;
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
    const companyId = await findCompanyId(companyName);
    if (!companyId) {
      return NextResponse.json({ ok: false, error: `Company "${companyName}" not found in Bigshare catalogue` });
    }
    const upstreamBody = `{ Applicationno: '',Company: '${companyId}',SelectionType: 'PN',PanNo: '${PAN}', txtcsdl: '', txtDPID: '', txtClId: '',ddlType:'',lang: 'en' }`;
    const upstream = await fetch(BIGSHARE_ENDPOINT, { method: "POST", headers: headers(), body: upstreamBody });
    if (!upstream.ok) {
      const message = `Upstream HTTP ${upstream.status}`;
      await recordSourceFailure(OPERATION_KEY, "Bigshare", "allotment-pan-search", new Error(message));
      return NextResponse.json({ ok: false, error: message });
    }
    const data = await upstream.json();
    await recordSourceSuccess(OPERATION_KEY, "Bigshare", "allotment-pan-search");
    const results = data?.d ? JSON.parse(data.d) : Array.isArray(data) ? data : [];
    return NextResponse.json({ ok: true, registrar: "bigshare", results }, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    await logApiError("registrar:bigshare", e);
    await recordSourceFailure(OPERATION_KEY, "Bigshare", "allotment-pan-search", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
  }
}
