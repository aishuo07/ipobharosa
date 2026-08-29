import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";
import { ocrCaptchaImage } from "@/lib/captcha-solver";

const OPERATION_KEY = "registrar:skyline:search";

/**
 * Skyline Financial Services allotment search.
 * Auto-solves image CAPTCHA using Tesseract.js OCR (free, no API key).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code, company_name } = body;
    const code = company_code || company_name;
    if (!PAN || !code) {
      return NextResponse.json(
        { error: "PAN and company_code required", available_companies_url: "https://www.skylinerta.com/ipo.php" },
        { status: 400 }
      );
    }

    // Step 1: Fetch the page to get session cookies and CAPTCHA
    const pageRes = await fetch("https://www.skylinerta.com/ipo.php", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    });
    const html = await pageRes.text();

    // Extract CAPTCHA image URL
    const captchaImgMatch = html.match(/<img[^>]*src=["']([^"']*captcha[^"']*)["']/i);

    if (!captchaImgMatch) {
      // No CAPTCHA detected — try direct POST
      const formData = new URLSearchParams();
      formData.append("company", code);
      formData.append("pan", PAN.toUpperCase());

      const upstream = await fetch("https://www.skylinerta.com/display_application.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.skylinerta.com/ipo.php",
        },
        body: formData.toString(),
      });

      const responseHtml = await upstream.text();

      if (responseHtml.includes("captcha") || responseHtml.includes("CAPTCHA")) {
        // Server still requires CAPTCHA — shouldn't happen if page didn't have one
        return NextResponse.json(
          { ok: false, registrar: "skyline", requires_captcha: true, error: "CAPTCHA required but not found on page" },
          { status: 502 }
        );
      }

      // Parse results
      const results: { company: string; status: string; shares: string; amount: string }[] = [];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRegex.exec(responseHtml)) !== null) {
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

      await recordSourceSuccess(OPERATION_KEY, "Skyline", "allotment-pan-search");
      return NextResponse.json(
        { ok: true, registrar: "skyline", pan: PAN, results },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Step 2: CAPTCHA found — fetch and OCR it
    const captchaUrl = captchaImgMatch[1].startsWith("http")
      ? captchaImgMatch[1]
      : `https://www.skylinerta.com/${captchaImgMatch[1]}`;

    const captchaRes = await fetch(captchaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.skylinerta.com/ipo.php",
      },
    });

    if (!captchaRes.ok) {
      return NextResponse.json({ error: "Could not fetch Skyline CAPTCHA image" }, { status: 502 });
    }

    const captchaBuffer = Buffer.from(await captchaRes.arrayBuffer());

    // Step 3: OCR the CAPTCHA (free, local)
    const captchaText = await ocrCaptchaImage(captchaBuffer);

    if (!captchaText || captchaText.length < 2 || captchaText.length > 8) {
      return NextResponse.json({
        ok: false,
        registrar: "skyline",
        requires_captcha: true,
        error: `CAPTCHA OCR returned unexpected text: "${captchaText}". Retrying may help.`,
        captcha_image_url: captchaUrl,
      }, { status: 502 });
    }

    // Step 4: Submit form with solved CAPTCHA
    const formData = new URLSearchParams();
    formData.append("company", code);
    formData.append("pan", PAN.toUpperCase());
    formData.append("captcha", captchaText);

    const submitRes = await fetch("https://www.skylinerta.com/display_application.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.skylinerta.com/ipo.php",
      },
      body: formData.toString(),
    });

    const resultHtml = await submitRes.text();

    // Check for CAPTCHA error
    if (resultHtml.includes("Invalid Captcha") || resultHtml.includes("invalid captcha") || resultHtml.includes("Wrong CAPTCHA")) {
      return NextResponse.json({
        ok: false,
        registrar: "skyline",
        requires_captcha: true,
        error: "CAPTCHA OCR was incorrect. Retrying may help.",
        captcha_image_url: captchaUrl,
      }, { status: 502 });
    }

    // Parse results
    const results: { company: string; status: string; shares: string; amount: string }[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(resultHtml)) !== null) {
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

    // Handle "no records"
    if (results.length === 0 && (resultHtml.includes("No Record") || resultHtml.includes("no record"))) {
      return NextResponse.json({
        ok: true,
        registrar: "skyline",
        pan: PAN,
        results: [],
        note: "No application found for this PAN",
      });
    }

    await recordSourceSuccess(OPERATION_KEY, "Skyline", "allotment-pan-search");
    return NextResponse.json(
      { ok: true, registrar: "skyline", pan: PAN, results },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e) {
    await logApiError("registrar:skyline:search", e);
    await recordSourceFailure(OPERATION_KEY, "Skyline", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
