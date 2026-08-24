import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const OPERATION_KEY = "registrar:mas:search";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code } = body;
    if (!PAN) {
      return NextResponse.json({ error: "PAN required" }, { status: 400 });
    }

    // MAS uses classic ASP — direct POST with PAN to ipo_search1.asp
    const formData = new URLSearchParams();
    formData.append("texthn", PAN.toUpperCase());

    const upstream = await fetch("https://www.masserv.com/ipo_search1.asp", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "IPOBharosa/1.0",
        Referer: "https://www.masserv.com/ipo_asearch.asp",
      },
      body: formData.toString(),
    });

    if (!upstream.ok) {
      const message = `Upstream HTTP ${upstream.status}`;
      await recordSourceFailure(OPERATION_KEY, "MAS", "allotment-pan-search", new Error(message));
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const html = await upstream.text();

    // Parse the response HTML for allotment results
    const results: { company: string; status: string; shares: string; amount: string }[] = [];

    // MAS returns a table with allotment data
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const cells = rowMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (cells && cells.length >= 3) {
        const clean = (s: string) => s.replace(/<[^>]+>/g, "").trim();
        const company = clean(cells[0] ?? "");
        const status = clean(cells[1] ?? "");
        const shares = clean(cells[2] ?? "");
        const amount = clean(cells[3] ?? "");
        if (company && status) {
          results.push({ company, status, shares, amount });
        }
      }
    }

    await recordSourceSuccess(OPERATION_KEY, "MAS", "allotment-pan-search");
    return NextResponse.json(
      { ok: true, registrar: "mas", pan: PAN, results, raw: html.substring(0, 2000) },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e) {
    await logApiError("registrar:search", e);
    await recordSourceFailure(OPERATION_KEY, "MAS", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
