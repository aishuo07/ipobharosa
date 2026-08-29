import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";
import { ocrCaptchaImage, solveMathCaptcha } from "@/lib/captcha-solver";

const OPERATION_KEY = "registrar:purva:search";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code, company_name } = body;
    const code = company_code || company_name;
    if (!PAN) {
      return NextResponse.json({ error: "PAN required" }, { status: 400 });
    }

    // Retry loop: fresh page + fresh CAPTCHA each attempt
    for (let attempt = 1; attempt <= 3; attempt++) {
      const pageRes = await fetch("https://www.purvashare.com/investor-service/ipo-query", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const pageHtml = await pageRes.text();
      const captchaImgMatch = pageHtml.match(/<img[^>]*src=["']([^"']*captcha[^"']*)["']/i);

      let captchaAnswer = "";
      if (captchaImgMatch) {
        const captchaUrl = captchaImgMatch[1].startsWith("http")
          ? captchaImgMatch[1]
          : `https://www.purvashare.com/${captchaImgMatch[1]}`;

        const captchaRes = await fetch(captchaUrl, {
          headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.purvashare.com/investor-service/ipo-query" },
        });
        if (captchaRes.ok) {
          const captchaBuffer = Buffer.from(await captchaRes.arrayBuffer());
          const captchaText = await ocrCaptchaImage(captchaBuffer);
          const mathResult = solveMathCaptcha(captchaText);
          captchaAnswer = mathResult || captchaText;
        }
      }

      // Try API endpoint
      const apiRes = await fetch("https://www.purvashare.com/api/ipo/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.purvashare.com/investor-service/ipo-query",
          Accept: "application/json",
        },
        body: JSON.stringify({ pan: PAN.toUpperCase(), company_id: code || "", captcha: captchaAnswer }),
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        await recordSourceSuccess(OPERATION_KEY, "Purva", "allotment-pan-search");
        return NextResponse.json({ ok: true, registrar: "purva", pan: PAN, results: data });
      }

      // Fallback to form POST
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
      if (html.includes("Invalid Captcha") || html.includes("invalid captcha") || html.includes("Wrong CAPTCHA")) {
        continue; // retry
      }

      const results: { company: string; status: string; shares: string; amount: string }[] = [];
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
          if (company && status) results.push({ company, status, shares, amount });
        }
      }

      if (results.length === 0 && (html.includes("No Record") || html.includes("no data"))) {
        return NextResponse.json({ ok: true, registrar: "purva", pan: PAN, results: [], note: "No application found" });
      }

      if (results.length > 0) {
        await recordSourceSuccess(OPERATION_KEY, "Purva", "allotment-pan-search");
        return NextResponse.json({ ok: true, registrar: "purva", pan: PAN, results });
      }
    }

    await recordSourceFailure(OPERATION_KEY, "Purva", "allotment-pan-search", new Error("CAPTCHA solving failed after 3 attempts"));
    return NextResponse.json({ ok: false, registrar: "purva", requires_captcha: true, error: "CAPTCHA solving failed after 3 attempts" }, { status: 502 });
  } catch (e) {
    await logApiError("registrar:purva:search", e);
    await recordSourceFailure(OPERATION_KEY, "Purva", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
