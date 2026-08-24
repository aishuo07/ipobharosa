#!/usr/bin/env node
/**
 * IPOBharosa — Unified Allotment Checker (Local)
 *
 * Usage:
 *   node scripts/check-allotment.mjs --pan ABCDE1234F
 *   node scripts/check-allotment.mjs --pan ABCDE1234F --ipo "Horizon Industrial Parks"
 *
 * Checks allotment across all registrars for a given PAN.
 * For CAPTCHA-bound registrars (Cameo/Skyline/Purva), uses Playwright + Tesseract.js.
 */

import { chromium } from "playwright";
import { createWorker } from "tesseract.js";

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const PAN = getArg("pan")?.toUpperCase();
const IPO_NAME = getArg("ipo");
const BASE_URL = getArg("url") || "https://ipobharosa.vercel.app";
const HEADFUL = args.includes("--headful");

if (!PAN) {
  console.error("Usage: node check-allotment.mjs --pan <PAN> [--ipo <NAME>]");
  process.exit(1);
}

const AUTOMATABLE = ["kfin", "bigshare", "mufg", "mas", "maashitla"];
const CAPTCHA_REGISTRARS = ["cameo", "skyline", "purva"];

async function checkAutomatable(registrar, pan, companyName) {
  try {
    const res = await fetch(`${BASE_URL}/api/registrar/${registrar}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ PAN: pan, company_name: companyName }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return { registrar, ...data };
  } catch (e) {
    return { registrar, ok: false, error: e.message };
  }
}

async function checkCaptchaRegistrar(registrar, pan, companyName) {
  const browser = await chromium.launch({ headless: !HEADFUL, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    if (registrar === "cameo") {
      await page.goto("https://ipostatus1.cameoindia.com/", { waitUntil: "networkidle" });
      await page.selectOption("#drpCompany", companyName);
      await page.selectOption("#ddlUserTypes", { label: "PAN NO" }).catch(() => {});
      await page.fill("#txtfolio", pan);

      // Solve CAPTCHA with Tesseract
      const worker = await createWorker("eng");
      for (let i = 0; i < 5; i++) {
        const captchaImg = page.locator("img[src*='Captcha'], img[src*='captcha']");
        await captchaImg.first().waitFor({ timeout: 5000 }).catch(() => null);
        const buffer = await captchaImg.first().screenshot();
        const { data: { text } } = await worker.recognize(buffer);
        const captcha = text.replace(/[^a-zA-Z0-9]/g, "").trim();
        if (captcha.length >= 3 && captcha.length <= 6) {
          const captchaInput = page.locator("input[id*='captcha']");
          if (await captchaInput.count() > 0) await captchaInput.first().fill(captcha);
          await page.click("#btngenerate");
          await page.waitForTimeout(3000);
          const body = await page.locator("body").innerText();
          if (!body.toLowerCase().includes("invalid captcha")) {
            await worker.terminate();
            return { registrar, ok: true, raw: body.substring(0, 3000) };
          }
        }
      }
      await worker.terminate();
      return { registrar, ok: false, error: "CAPTCHA solving failed" };
    }

    return { registrar, ok: false, error: "CAPTCHA solver not implemented for this registrar" };
  } catch (e) {
    return { registrar, ok: false, error: e.message };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`\n🔍 IPOBharosa Allotment Check`);
  console.log(`   PAN: ${PAN}`);
  if (IPO_NAME) console.log(`   IPO: ${IPO_NAME}`);
  console.log(`\n   Checking automatable registrars...`);

  const results = [];

  // Check automatable registrars via API
  for (const reg of AUTOMATABLE) {
    process.stdout.write(`   ${reg}... `);
    const result = await checkAutomatable(reg, PAN, IPO_NAME || "");
    results.push(result);
    if (result.ok) {
      console.log(`✅ ${result.results?.length || 0} results`);
    } else {
      console.log(`❌ ${result.error}`);
    }
  }

  // For CAPTCHA registrars, try local Playwright
  const doCaptcha = args.includes("--captcha");
  if (doCaptcha) {
    console.log(`\n   Checking CAPTCHA registrars (local Playwright)...`);
    for (const reg of CAPTCHA_REGISTRARS) {
      process.stdout.write(`   ${reg}... `);
      const result = await checkCaptchaRegistrar(reg, PAN, IPO_NAME || "");
      results.push(result);
      if (result.ok) {
        console.log(`✅`);
      } else {
        console.log(`❌ ${result.error}`);
      }
    }
  } else {
    console.log(`\n   CAPTCHA registrars skipped (use --captcha to enable)`);
  }

  // Summary
  console.log(`\n📊 Summary:`);
  for (const r of results) {
    const status = r.ok ? (r.results?.length > 0 ? "FOUND" : "NOT_FOUND") : "ERROR";
    console.log(`   ${r.registrar}: ${status} ${r.error ? `(${r.error})` : ""}`);
  }
}

main();
