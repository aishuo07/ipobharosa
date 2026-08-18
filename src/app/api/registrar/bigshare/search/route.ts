import { NextResponse } from "next/server";

const BIGSHARE_ENDPOINT = "https://ipo.bigshareonline.com/Data.aspx/FetchIpodetails";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, Accept",
  "Access-Control-Max-Age": "86400",
};

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { Company, SelectionType = "PN", PanNo, Applicationno = "", txtcsdl = "", txtDPID = "", txtClId = "", ddlType = "", lang = "en" } = body;
    if (!Company || !PanNo) {
      return NextResponse.json({ error: "Company and PanNo required" }, { status: 400, headers: corsHeaders });
    }
    const upstreamBody = `{ Applicationno: '${Applicationno}',Company: '${Company}',SelectionType: '${SelectionType}',PanNo: '${PanNo}', txtcsdl: '${txtcsdl}', txtDPID: '${txtDPID}', txtClId: '${txtClId}',ddlType:'${ddlType}',lang: '${lang}' }`;
    const upstream = await fetch(BIGSHARE_ENDPOINT, {
      method: "POST",
      headers: headers(),
      body: upstreamBody,
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream HTTP ${upstream.status}` }, { status: 502, headers: corsHeaders });
    }
    const data = await upstream.json();
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500, headers: corsHeaders });
  }
}