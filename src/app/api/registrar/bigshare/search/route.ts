import { logApiError } from "@/lib/api-logger";
import { NextResponse } from "next/server";
import { recordSourceSuccess, recordSourceFailure } from "@/lib/ingestion/source-operation";
import { ocrCaptchaImage } from "@/lib/captcha-solver";

const OPERATION_KEY = "registrar:bigshare:search";

async function fetchBigshareCaptcha(): Promise<{ token: string; imageBuffer: Buffer } | null> {
  const res = await fetch("https://ipo.bigshareonline.com/Captcha.ashx", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://ipo.bigshareonline.com/ipo_status.html",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const token = data.token || data.Token;
  const image = data.image || data.Image;
  if (!token || !image) return null;

  // Extract base64 from data:image/png;base64,...
  const base64 = image.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(base64, "base64");
  return { token, imageBuffer };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PAN, company_code, company_name } = body;
    const code = company_code || company_name;
    if (!PAN || !code) {
      return NextResponse.json({ error: "PAN and company_code required" }, { status: 400 });
    }

    // Retry loop: fresh CAPTCHA each attempt
    for (let attempt = 1; attempt <= 3; attempt++) {
      const captcha = await fetchBigshareCaptcha();
      if (!captcha) continue;

      const captchaText = await ocrCaptchaImage(captcha.imageBuffer);
      if (!captchaText || captchaText.length < 3 || captchaText.length > 8) continue;

      // Submit search with CAPTCHA
      const searchBody = {
        Applicationno: "",
        Company: code,
        SelectionType: "PN",
        PanNo: PAN.toUpperCase(),
        txtcsdl: "",
        txtDPID: "",
        txtClId: "",
        ddlType: "",
        lang: "en",
        CaptchaToken: captcha.token,
        CaptchaAnswer: captchaText,
        ResultToken: "",
      };

      const searchRes = await fetch("https://ipo.bigshareonline.com/Data.aspx/FetchIpodetails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://ipo.bigshareonline.com/ipo_status.html",
          Origin: "https://ipo.bigshareonline.com",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify(searchBody),
      });

      if (!searchRes.ok) continue;

      const searchData = await searchRes.json();
      const d = searchData.d;

      if (!d) continue;

      // Check for CAPTCHA error
      if (d.Status === "ERROR" && d.Message?.toLowerCase().includes("captcha")) {
        continue; // retry
      }

      // Check for "No data found"
      if (d.DPID === "No data found" || d.Status === "NOT_FOUND") {
        await recordSourceSuccess(OPERATION_KEY, "Bigshare", "allotment-pan-search");
        return NextResponse.json({ ok: true, registrar: "bigshare", pan: PAN, results: [], note: "No application found" });
      }

      // Parse result
      if (d.Name || d.APPLICATION_NO) {
        const allotted = parseInt(d.ALLOTED || "0", 10);
        await recordSourceSuccess(OPERATION_KEY, "Bigshare", "allotment-pan-search");
        return NextResponse.json({
          ok: true,
          registrar: "bigshare",
          pan: PAN,
          results: [{
            company: code,
            status: allotted > 0 ? "ALLOTTED" : "NOT_ALLOTTED",
            shares: d.ALLOTED || "0",
            amount: d.APPLIED || "",
            applicant: d.Name,
            application_no: d.APPLICATION_NO,
          }],
        });
      }
    }

    await recordSourceFailure(OPERATION_KEY, "Bigshare", "allotment-pan-search", new Error("CAPTCHA solving failed after 3 attempts"));
    return NextResponse.json({ ok: false, requires_captcha: true, error: "CAPTCHA solving failed after 3 attempts" }, { status: 502 });
  } catch (e) {
    await logApiError("registrar:bigshare:search", e);
    await recordSourceFailure(OPERATION_KEY, "Bigshare", "allotment-pan-search", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
