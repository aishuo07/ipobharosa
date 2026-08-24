import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";

const OPERATION_KEY = "registrar:skyline:search";

/**
 * Skyline Financial Services allotment search.
 *
 * CAPTCHA LIMITATION: Skyline uses an image CAPTCHA that cannot be solved
 * in a serverless environment. This endpoint returns the form structure
 * for manual solving or local Playwright automation.
 *
 * For automated solving, run the companion script:
 *   node scripts/skyline-allotment-check.mjs --pan <PAN> --company <CODE>
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code } = body;
    if (!PAN || !company_code) {
      return NextResponse.json(
        { error: "PAN and company_code required", available_companies_url: "https://www.skylinerta.com/ipo.php" },
        { status: 400 }
      );
    }

    // Step 1: Fetch the page to get form structure
    const pageRes = await fetch("https://www.skylinerta.com/ipo.php", {
      headers: { "User-Agent": "IPOBharosa/1.0" },
    });
    const html = await pageRes.text();

    // Skyline uses PHP — simpler than ASP.NET but still needs CAPTCHA
    const captchaImgMatch = html.match(/<img[^>]*src=["']([^"']*captcha[^"']*)["']/i);

    if (!captchaImgMatch) {
      // Try direct POST without CAPTCHA (some forms accept it)
      const formData = new URLSearchParams();
      formData.append("company", company_code);
      formData.append("pan", PAN.toUpperCase());

      const upstream = await fetch("https://www.skylinerta.com/display_application.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "IPOBharosa/1.0",
          Referer: "https://www.skylinerta.com/ipo.php",
        },
        body: formData.toString(),
      });

      const responseHtml = await upstream.text();

      // Check if we got results or a CAPTCHA challenge
      if (responseHtml.includes("captcha") || responseHtml.includes("CAPTCHA")) {
        await recordSourceFailure(OPERATION_KEY, "Skyline", "allotment-pan-search", new Error("CAPTCHA required"));
        return NextResponse.json(
          {
            ok: false,
            registrar: "skyline",
            requires_captcha: true,
            form_action: "https://www.skylinerta.com/display_application.php",
            form_fields: { company: company_code, pan: PAN.toUpperCase() },
            note: "CAPTCHA solving required — use local Playwright script",
          },
          { headers: { "Access-Control-Allow-Origin": "*" } }
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

    // CAPTCHA detected — return form structure
    const captchaUrl = captchaImgMatch[1].startsWith("http")
      ? captchaImgMatch[1]
      : `https://www.skylinerta.com/${captchaImgMatch[1]}`;

    await recordSourceFailure(OPERATION_KEY, "Skyline", "allotment-pan-search", new Error("CAPTCHA solving required"));

    return NextResponse.json(
      {
        ok: false,
        registrar: "skyline",
        requires_captcha: true,
        captcha_image_url: captchaUrl,
        form_action: "https://www.skylinerta.com/display_application.php",
        form_fields: { company: company_code, pan: PAN.toUpperCase() },
        note: "Solve the CAPTCHA and include it as 'captcha' field in POST body",
      },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e) {
    await logApiError("registrar:search", e);
    await recordSourceFailure(OPERATION_KEY, "Skyline", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
