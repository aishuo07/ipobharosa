#!/usr/bin/env node
/**
 * Cameo Corporate Services — Automated Allotment Check with CAPTCHA solving
 *
 * Usage:
 *   node scripts/cameo-allotment-check.mjs --pan ABCDE1234F --company TNE
 *   node scripts/cameo-allotment-check.mjs --pan ABCDE1234F --company TNE --headful
 *
 * Requires: playwright, tesseract.js
 */

import { chromium } from "playwright";
import { createWorker } from "tesseract.js";

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const PAN = getArg("pan")?.toUpperCase();
const COMPANY = getArg("company");
const HEADFUL = args.includes("--headful");

if (!PAN || !COMPANY) {
  console.error("Usage: node cameo-allotment-check.mjs --pan <PAN> --company <CODE>");
  process.exit(1);
}

async function solveCaptcha(page) {
  const worker = await createWorker("eng");

  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`  Attempt ${attempt}: Waiting for CAPTCHA...`);

    const captchaImg = page.locator("img[src*='Captcha'], img[src*='captcha'], img[src*='GenerateCaptcha']");
    await captchaImg.first().waitFor({ timeout: 10000 }).catch(() => null);

    // Screenshot the CAPTCHA
    const captchaElement = captchaImg.first();
    const buffer = await captchaElement.screenshot();

    // OCR with Tesseract
    const { data: { text } } = await worker.recognize(buffer);
    const captchaText = text.replace(/[^a-zA-Z0-9]/g, "").trim();

    console.log(`  OCR result: "${captchaText}"`);

    if (captchaText.length >= 3 && captchaText.length <= 6) {
      // Fill CAPTCHA
      const captchaInput = page.locator("input[name*='captcha'], input[id*='captcha'], input[id*='txtcaptcha']");
      if (await captchaInput.count() > 0) {
        await captchaInput.first().fill(captchaText);
      }

      // Submit
      await page.click("#btngenerate");
      await page.waitForTimeout(3000);

      // Check if CAPTCHA was wrong
      const bodyText = await page.locator("body").innerText();
      if (!bodyText.toLowerCase().includes("invalid captcha") && !bodyText.toLowerCase().includes("wrong captcha")) {
        await worker.terminate();
        return bodyText;
      }

      console.log(`  CAPTCHA wrong, retrying...`);
      // Refresh CAPTCHA
      const refreshBtn = page.locator("a[href*='captcha'], img[src*='refresh'], a[onclick*='captcha']");
      if (await refreshBtn.count() > 0) {
        await refreshBtn.first().click();
        await page.waitForTimeout(1000);
      }
    }
  }

  await worker.terminate();
  return null;
}

async function main() {
  console.log(`🔍 Cameo Allotment Check: PAN=${PAN}, Company=${COMPANY}`);

  const browser = await chromium.launch({ headless: !HEADFUL, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto("https://ipostatus1.cameoindia.com/", { waitUntil: "networkidle" });
    await page.selectOption("#drpCompany", COMPANY);
    await page.selectOption("#ddlUserTypes", { label: "PAN NO" }).catch(() => page.selectOption("#ddlUserTypes", "PAN NO"));
    await page.fill("#txtfolio", PAN);

    console.log("🔐 Solving CAPTCHA with Tesseract.js...");
    const resultText = await solveCaptcha(page);

    if (resultText) {
      console.log("\n📋 Result:");
      console.log(resultText.substring(0, 2000));

      // Output JSON for API consumption
      const result = { ok: true, registrar: "cameo", pan: PAN, raw: resultText.substring(0, 5000) };
      console.log("\n__JSON__" + JSON.stringify(result));
    } else {
      console.log("\n❌ Could not solve CAPTCHA after 5 attempts");
      console.log("__JSON__" + JSON.stringify({ ok: false, error: "CAPTCHA solving failed" }));
    }

    await page.screenshot({ path: "/tmp/cameo-result.png", fullPage: true });
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.log("__JSON__" + JSON.stringify({ ok: false, error: error.message }));
  } finally {
    await browser.close();
  }
}

main();
