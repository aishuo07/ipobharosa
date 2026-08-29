import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";
import { ocrCaptchaImage, solveMathCaptcha } from "@/lib/captcha-solver";

const OPERATION_KEY = "registrar:purva:search";

/**
 * Purva Sharegistry allotment search.
 * Solves math CAPTCHA using local OCR + arithmetic (free, no API key).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code, company_name } = body;
    const code = company_code || company_name;
    if (!PAN) {
      return NextResponse.json({ error: "PAN required" }, { status: 400 });
    }

    // Step 1: Fetch the page to get session cookies and CAPTCHA
    const pageRes = await fetch("https://www.purvashare.com/investor-service/ipo-query", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const pageHtml = await pageRes.text();

    // Extract CAPTCHA image URL
    const captchaImgMatch = pageHtml.match(/<img[^>]*src=["']([^"']*captcha[^"']*)["']/i);

    let captchaAnswer = "";

    if (captchaImgMatch) {
      // Step 2a: Fetch CAPTCHA image
      const captchaUrl = captchaImgMatch[1].startsWith("http")
        ? captchaImgMatch[1]
        : `https://www.purvashare.com/${captchaImgMatch[1]}`;

      const captchaRes = await fetch(captchaUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.purvashare.com/investor-service/ipo-query",
        },
      });

      if (captchaRes.ok) {
        const captchaBuffer = Buffer.from(await captchaRes.arrayBuffer());
        const captchaText = await ocrCaptchaImage(captchaBuffer);

        // Try math solve first
        const mathResult = solveMathCaptcha(captchaText);
        if (mathResult) {
          captchaAnswer = mathResult;
        } else {
          captchaAnswer = captchaText;
        }
      }
    }

    // Step 3: Try the API endpoint
    const apiRes = await fetch("https://www.purvashare.com/api/ipo/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.purvashare.com/investor-service/ipo-query",
        Accept: "application/json",
      },
      body: JSON.stringify({
        pan: PAN.toUpperCase(),
        company_id: code || "",
        captcha: captchaAnswer,
      }),
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      await recordSourceSuccess(OPERATION_KEY, "Purva", "allotment-pan-search");
      return NextResponse.json(
        { ok: true, registrar: "purva", pan: PAN, results: data },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Step 4: Fallback to form POST
    const formData = new URLSearchParams();
    formData.append("pan", PAN.toUpperCase());
    if (code) formData.append("company_id", code);
    formData.append("captcha", captchaAnswer);

    const upstream = await fetch("https://www.purvashare.com/investor-service/ipo-query", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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

    // Handle no records
    if (results.length === 0 && (html.includes("No Record") || html.includes("no data"))) {
      return NextResponse.json({
        ok: true,
        registrar: "purva",
        pan: PAN,
        results: [],
        note: "No application found for this PAN",
      });
    }

    await recordSourceSuccess(OPERATION_KEY, "Purva", "allotment-pan-search");
    return NextResponse.json(
      { ok: true, registrar: "purva", pan: PAN, results },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e) {
    await logApiError("registrar:purva:search", e);
    await recordSourceFailure(OPERATION_KEY, "Purva", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
