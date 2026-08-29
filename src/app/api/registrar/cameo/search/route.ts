import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";
import { ocrCaptchaImage } from "@/lib/captcha-solver";

const OPERATION_KEY = "registrar:cameo:search";

async function fetchCameoPage() {
  const res = await fetch("https://ipostatus1.cameoindia.com/", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
  });
  return res.text();
}

async function fetchCaptchaImage(): Promise<Buffer | null> {
  const res = await fetch(`https://ipostatus1.cameoindia.com/GenerateCaptcha.aspx?${Date.now()}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://ipostatus1.cameoindia.com/",
    },
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code, company_name } = body;
    const code = company_code || company_name;
    if (!PAN || !code) {
      return NextResponse.json(
        { error: "PAN and company_code required", available_companies_url: "https://ipostatus1.cameoindia.com/" },
        { status: 400 }
      );
    }

    // Retry loop: fresh page + fresh CAPTCHA each attempt
    for (let attempt = 1; attempt <= 3; attempt++) {
      const html = await fetchCameoPage();
      const viewState = html.match(/__VIEWSTATE[^>]*value="([^"]*)"/)?.[1] || "";
      const eventValidation = html.match(/__EVENTVALIDATION[^>]*value="([^"]*)"/)?.[1] || "";
      const viewStateGen = html.match(/__VIEWSTATEGENERATOR[^>]*value="([^"]*)"/)?.[1] || "";

      if (!viewState) {
        return NextResponse.json({ error: "Could not extract ASP.NET tokens from Cameo" }, { status: 502 });
      }

      const captchaBuffer = await fetchCaptchaImage();
      if (!captchaBuffer) {
        return NextResponse.json({ error: "Could not fetch Cameo CAPTCHA image" }, { status: 502 });
      }

      const captchaText = await ocrCaptchaImage(captchaBuffer);
      if (!captchaText || captchaText.length < 3 || captchaText.length > 8) continue;

      const formData = new URLSearchParams();
      formData.append("__VIEWSTATE", viewState);
      formData.append("__VIEWSTATEGENERATOR", viewStateGen);
      formData.append("__EVENTVALIDATION", eventValidation);
      formData.append("drpCompany", code);
      formData.append("ddlUserTypes", "PAN NO");
      formData.append("txtfolio", PAN.toUpperCase());
      formData.append("txt_phy_captcha", captchaText);
      formData.append("btnSubmit", "Submit");

      const submitRes = await fetch("https://ipostatus1.cameoindia.com/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://ipostatus1.cameoindia.com/",
        },
        body: formData.toString(),
      });

      const resultHtml = await submitRes.text();

      if (resultHtml.includes("Invalid Captcha") || resultHtml.includes("invalid captcha") || resultHtml.includes("Wrong CAPTCHA")) {
        continue; // retry
      }

      // Parse results
      const results: { company: string; status: string; shares: string; amount: string }[] = [];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRegex.exec(resultHtml)) !== null) {
        const cells = rowMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (cells && cells.length >= 2) {
          const clean = (s: string) => s.replace(/<[^>]+>/g, "").trim();
          const col1 = clean(cells[0] ?? "");
          const col2 = clean(cells[1] ?? "");
          const col3 = cells.length > 2 ? clean(cells[2]) : "";
          const col4 = cells.length > 3 ? clean(cells[3]) : "";
          if (col1.toLowerCase().includes("application") || col1.toLowerCase().includes("sno")) continue;
          if (col1 && col2) {
            let status = "UNKNOWN";
            const combined = (col2 + " " + col3 + " " + col4).toLowerCase();
            if (combined.includes("allotted") && !combined.includes("not allotted")) status = "ALLOTTED";
            else if (combined.includes("not allotted")) status = "NOT_ALLOTTED";
            results.push({ company: code, status, shares: col3 || "0", amount: col4 || "" });
          }
        }
      }

      if (results.length === 0 && (resultHtml.includes("No Record") || resultHtml.includes("no record") || resultHtml.includes("No Data"))) {
        return NextResponse.json({ ok: true, registrar: "cameo", pan: PAN, results: [], note: "No application found" });
      }

      if (results.length > 0) {
        await recordSourceSuccess(OPERATION_KEY, "Cameo", "allotment-pan-search");
        return NextResponse.json({ ok: true, registrar: "cameo", pan: PAN, results });
      }

      // If no results parsed but no explicit error, might be wrong CAPTCHA
    }

    // All 3 attempts failed
    await recordSourceFailure(OPERATION_KEY, "Cameo", "allotment-pan-search", new Error("CAPTCHA OCR failed after 3 attempts"));
    return NextResponse.json({
      ok: false,
      registrar: "cameo",
      requires_captcha: true,
      error: "CAPTCHA solving failed after 3 attempts. Please try again.",
    }, { status: 502 });
  } catch (e) {
    await logApiError("registrar:cameo:search", e);
    await recordSourceFailure(OPERATION_KEY, "Cameo", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
