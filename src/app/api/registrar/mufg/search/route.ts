import { NextResponse } from "next/server";

const MUFG_ORIGIN = "https://in.mpms.mufg.com";
const MUFG_REFERER = "https://in.mpms.mufg.com/Initial_Offer/public-issues.html";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Requested-With, Accept",
  "Access-Control-Max-Age": "86400",
};

function headers() {
  return {
    "User-Agent": "IPOBharosa/1.0",
    "X-Requested-With": "XMLHttpRequest",
    Origin: MUFG_ORIGIN,
    Referer: MUFG_REFERER,
    "Content-Type": "application/json; charset=UTF-8",
    Accept: "application/json, text/javascript, */*; q=0.01",
  };
}

function unwrapD(json: unknown): unknown {
  let d = (json as { d?: unknown })?.d;
  if (d === undefined) d = json;
  if (typeof d === "string") {
    const trimmed = d.trim();
    if (trimmed.startsWith("<")) {
      return parseXmlRows(d);
    }
    try {
      return JSON.parse(d);
    } catch {
      /* leave as string */
    }
  }
  return d;
}

function parseXmlRows(xml: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const tableRe = /<Table\b[^>]*>([\s\S]*?)<\/Table>/gi;
  const fieldRe = /<([A-Za-z0-9_]+)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRe.exec(xml)) !== null) {
    const record: Record<string, string> = {};
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRe.exec(tableMatch[1])) !== null) {
      record[fieldMatch[1].toUpperCase()] = fieldMatch[2];
    }
    if (Object.keys(record).length) rows.push(record);
  }
  return rows;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientid, PAN, IFSC = "", CHKVAL = "1", token = "" } = body;
    if (!clientid || !PAN) {
      return NextResponse.json({ error: "clientid and PAN required" }, { status: 400, headers: corsHeaders });
    }
    const upstream = await fetch(`${MUFG_ORIGIN}/Initial_Offer/IPO.aspx/SearchOnPan`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ clientid, PAN, IFSC, CHKVAL, token }),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream HTTP ${upstream.status}` }, { status: 502, headers: corsHeaders });
    }
    const data = unwrapD(await upstream.json());
    const rows = Array.isArray(data) ? data : (data as { Table?: unknown[] })?.Table ?? [];
    return NextResponse.json(rows, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500, headers: corsHeaders });
  }
}