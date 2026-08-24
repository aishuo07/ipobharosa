import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const BIGSHARE_ENDPOINT = "https://ipo.bigshareonline.com/Data.aspx/FetchIpodetails";

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const Company = body.Company || body.company_code || body.companyCode;
    const PanNo = body.PanNo || body.PAN || body.pan;
    if (!Company || !PanNo) {
      return NextResponse.json({ error: "PAN and company_code required" }, { status: 400 });
    }
    const upstreamBody = `{ Applicationno: '',Company: '${Company}',SelectionType: 'PN',PanNo: '${PanNo}', txtcsdl: '', txtDPID: '', txtClId: '',ddlType:'',lang: 'en' }`;
    const upstream = await fetch(BIGSHARE_ENDPOINT, {
      method: "POST",
      headers: headers(),
      body: upstreamBody,
    });
    if (!upstream.ok) {
      const message = `Upstream HTTP ${upstream.status}`;
      await recordSourceFailure(OPERATION_KEY, "Bigshare", "allotment-pan-search", new Error(message));
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const data = await upstream.json();
    await recordSourceSuccess(OPERATION_KEY, "Bigshare", "allotment-pan-search");
    return NextResponse.json(data, { headers: { "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    await recordSourceFailure(OPERATION_KEY, "Bigshare", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
