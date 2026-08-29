import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceFailure } from "@/lib/ingestion/source-operation";

const OPERATION_KEY = "registrar:cameo:search";

/**
 * Cameo Corporate Services allotment search.
 *
 * CAPTCHA LIMITATION: Cameo uses an image CAPTCHA that cannot be solved
 * in a serverless environment. This endpoint returns the form structure
 * and CAPTCHA image URL for manual solving or local Playwright automation.
 *
 * For automated solving, run the companion script:
 *   node scripts/cameo-allotment-check.mjs --pan <PAN> --company <CODE>
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code } = body;
    if (!PAN || !company_code) {
      return NextResponse.json(
        { error: "PAN and company_code required", available_companies_url: "https://ipostatus1.cameoindia.com/" },
        { status: 400 }
      );
    }

    // Step 1: Fetch the page to get ASP.NET tokens
    const pageRes = await fetch("https://ipostatus1.cameoindia.com/", {
      headers: { "User-Agent": "IPOBharosa/1.0" },
    });
    const html = await pageRes.text();

    // Extract ASP.NET tokens
    const viewState = html.match(/__VIEWSTATE[^>]*value="([^"]*)"/)?.[1] || "";
    const eventValidation = html.match(/__EVENTVALIDATION[^>]*value="([^"]*)"/)?.[1] || "";

    if (!viewState) {
      return NextResponse.json(
        { error: "Could not extract ASP.NET tokens — CAPTCHA solving required", raw_html_snippet: html.substring(0, 1000) },
        { status: 501 }
      );
    }

    // Step 2: CAPTCHA is required — return form structure for manual/local solving
    const captchaImageUrl = `https://ipostatus1.cameoindia.com/GenerateCaptcha.aspx?${Date.now()}`;

    await recordSourceFailure(OPERATION_KEY, "Cameo", "allotment-pan-search", new Error("CAPTCHA solving required — use local Playwright script"));

    return NextResponse.json(
      {
        ok: false,
        registrar: "cameo",
        requires_captcha: true,
        captcha_image_url: captchaImageUrl,
        form_action: "https://ipostatus1.cameoindia.com/",
        form_fields: {
          drpCompany: company_code,
          ddlUserTypes: "PAN NO",
          txtfolio: PAN.toUpperCase(),
          __VIEWSTATE: viewState.substring(0, 50) + "...",
          __EVENTVALIDATION: eventValidation.substring(0, 50) + "...",
        },
        instructions: "Solve the CAPTCHA image and POST all fields including txt_phy_captcha to the form action URL",
        note: "For automated solving, use: node scripts/cameo-allotment-check.mjs --pan <PAN> --company <CODE>",
      },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (e) {
    await logApiError("registrar:search", e);
    await recordSourceFailure(OPERATION_KEY, "Cameo", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
