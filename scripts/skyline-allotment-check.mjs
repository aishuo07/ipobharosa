#!/usr/bin/env node
/**
 * Skyline Financial Services — Automated Allotment Check
 *
 * Usage:
 *   node scripts/skyline-allotment-check.mjs --pan ABCDE1234F --company ABC
 *   node scripts/skyline-allotment-check.mjs --pan ABCDE1234F --company ABC --headful
 *
 * Requires: playwright (npm install playwright)
 */

import { chromium } from "playwright";

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const PAN = getArg("pan")?.toUpperCase();
const COMPANY = getArg("company");
const HEADFUL = args.includes("--headful");

if (!PAN || !COMPANY) {
  console.error("Usage: node skyline-allotment-check.mjs --pan <PAN> --company <CODE>");
  console.error("Example: node skyline-allotment-check.mjs --pan ABCDE1234F --company ABC");
  process.exit(1);
}

async function main() {
  console.log(`🔍 Skyline Allotment Check: PAN=${PAN}, Company=${COMPANY}`);

  const browser = await chromium.launch({
    headless: !HEADFUL,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    console.log("📄 Navigating to Skyline IPO page...");
    await page.goto("https://www.skylinerta.com/ipo.php", { waitUntil: "networkidle" });

    // Select company from dropdown
    console.log(`📋 Selecting company: ${COMPANY}`);
    try {
      await page.selectOption("select[name='company']", COMPANY);
    } catch {
      // Try by label text
      try {
        await page.selectOption("select[name='company']", { label: COMPANY });
      } catch {
        // List available options
        const options = await page.locator("select[name='company'] option").allTextContents();
        console.log("   Available companies:", options.filter(o => o.trim() && !o.includes("Select")).slice(0, 10).join(", "), "...");
        console.log(`   ❌ Company '${COMPANY}' not found in dropdown`);
        await browser.close();
        process.exit(1);
      }
    }

    // Select PAN radio button
    console.log("📋 Selecting PAN lookup...");
    const panRadio = page.locator("input[type='radio'][value*='pan'], input[type='radio'][name*='search_type']");
    if (await panRadio.count() > 0) {
      await panRadio.first().click();
    }

    // Enter PAN
    console.log(`⌨️  Entering PAN: ${PAN}`);
    const panInput = page.locator("input[name='pan'], input[name='PAN'], input[id*='pan']");
    await panInput.first().fill(PAN);

    // Check if CAPTCHA is present
    const captchaImg = page.locator("img[src*='captcha'], img[src*='CAPTCHA']");
    const hasCaptcha = (await captchaImg.count()) > 0;

    if (hasCaptcha) {
      console.log("🔐 CAPTCHA detected — taking screenshot for manual solving...");
      const captchaBuffer = await captchaImg.first().screenshot();
      const fs = await import("fs");
      fs.writeFileSync("/tmp/skyline-captcha.png", captchaBuffer);
      console.log("📸 CAPTCHA saved: /tmp/skyline-captcha.png");
      console.log("⚠️  Please solve the CAPTCHA manually or integrate Tesseract.js");
    }

    // Try submitting
    console.log("🚀 Submitting form...");
    const submitBtn = page.locator("input[type='submit'], button[type='submit'], input[name='submit']");
    if (await submitBtn.count() > 0) {
      await submitBtn.first().click();
    } else {
      await page.keyboard.press("Enter");
    }

    // Wait for response
    await page.waitForTimeout(3000);

    // Get the result
    const resultText = await page.locator("body").innerText();
    console.log("\n📋 Page Response:");
    console.log(resultText.substring(0, 2000));

    // Take a screenshot
    await page.screenshot({ path: "/tmp/skyline-result.png", fullPage: true });
    console.log("\n📸 Screenshot saved: /tmp/skyline-result.png");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await browser.close();
  }
}

main();
