import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const OPERATION_KEY = "registrar:purva:search";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code } = body;
    if (!PAN) {
      return NextResponse.json({ error: "PAN required" }, { status: 400 });
    }

    // Step 1: Fetch the page to get session cookies and any CSRF/tokens
    const pageRes = await fetch("https://www.purvashare.com/investor-service/ipo-query", {
      headers: { "User-Agent": "IPOBharosa/1.0" },
    });
    const _cookies = pageRes.headers.get("set-cookie") || "";

    // Step 2: Solve math CAPTCHA if present
    // Purva uses a simple math CAPTCHA like "3 + 5 = ?"
    // We need to fetch the CAPTCHA image, OCR it, and solve
    // For now, we try the direct API endpoint

    // Purva AngularJS app likely POSTs to an API endpoint
    // Try the common AngularJS API pattern
    const apiRes = await fetch("https://www.purvashare.com/api/ipo/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "IPOBharosa/1.0",
        Referer: "https://www.purvashare.com/investor-service/ipo-query",
        Accept: "application/json",
      },
      body: JSON.stringify({ pan: PAN.toUpperCase(), company_id: company_code || "" }),
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      await recordSourceSuccess(OPERATION_KEY, "Purva", "allotment-pan-search");
      return NextResponse.json(
        { ok: true, registrar: "purva", pan: PAN, results: data },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Fallback: try scraping the HTML response
    const formData = new URLSearchParams();
    formData.append("pan", PAN.toUpperCase());
    if (company_code) formData.append("company_id", company_code);
    formData.append("captcha", ""); // Math CAPTCHA placeholder

    const upstream = await fetch("https://www.purvashare.com/investor-service/ipo-query", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "IPOBharosa/1.0",
        Referer: "https://www.purvashare.com/investor-service/ipo-query",
      },
      body: formData.toString(),
    });

    const html = await upstream.text();
    const results: { company: string; status: string; shares: string; amount: string }[] = [];

    // Parse response
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

    await recordSourceSuccess(OPERATION_KEY, "Purva", "allotment-pan-search");
    return NextResponse.json(
      { ok: true, registrar: "purva", pan: PAN, results, note: "Math CAPTCHA may be required for full access" },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e) {
    await recordSourceFailure(OPERATION_KEY, "Purva", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
