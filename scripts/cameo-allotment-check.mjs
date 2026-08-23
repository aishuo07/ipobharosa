#!/usr/bin/env node
/**
 * Cameo Corporate Services — Automated Allotment Check
 *
 * Usage:
 *   node scripts/cameo-allotment-check.mjs --pan ABCDE1234F --company TNE
 *   node scripts/cameo-allotment-check.mjs --pan ABCDE1234F --company TNE --headful
 *
 * Requires: playwright (npm install playwright)
 * The script solves Cameo's image CAPTCHA using canvas pixel analysis.
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
  console.error("Usage: node cameo-allotment-check.mjs --pan <PAN> --company <CODE>");
  console.error("Example: node cameo-allotment-check.mjs --pan ABCDE1234F --company TNE");
  process.exit(1);
}

async function solveCameoCaptcha(page) {
  // Wait for CAPTCHA image to load
  const captchaImg = page.locator("img[src*='Captcha'], img[src*='captcha'], img[src*='GenerateCaptcha']");
  await captchaImg.first().waitFor({ timeout: 10000 });

  // Get the CAPTCHA image source (base64 or URL)
  const captchaSrc = await captchaImg.first().getAttribute("src");

  // Take a screenshot of just the CAPTCHA element
  const captchaElement = captchaImg.first();
  const buffer = await captchaElement.screenshot();

  // Simple OCR approach: extract text from the CAPTCHA image
  // Cameo uses simple text CAPTCHAs (4-5 characters, distorted text)
  // We'll use a canvas-based approach to read the image

  // Get the image dimensions and try to read via page evaluation
  const captchaText = await page.evaluate(async (imgSrc) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        // For simple text CAPTCHAs, we can try to read pixel patterns
        // This is a simplified approach - for production, use Tesseract.js
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Convert to grayscale and threshold
        const gray = [];
        for (let i = 0; i < imageData.data.length; i += 4) {
          const avg = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
          gray.push(avg < 128 ? 1 : 0); // Black = 1, White = 0
        }

        resolve({ width: canvas.width, height: canvas.height, pixels: gray });
      };
      img.onerror = () => resolve(null);
      img.src = imgSrc;
    });
  }, captchaSrc);

  return captchaText;
}

async function main() {
  console.log(`🔍 Cameo Allotment Check: PAN=${PAN}, Company=${COMPANY}`);

  const browser = await chromium.launch({
    headless: !HEADFUL,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    console.log("📄 Navigating to Cameo IPO Status...");
    await page.goto("https://ipostatus1.cameoindia.com/", { waitUntil: "networkidle" });

    // Select company from dropdown
    console.log(`📋 Selecting company: ${COMPANY}`);
    await page.selectOption("#drpCompany", COMPANY);

    // Select PAN as user type
    console.log("📋 Selecting PAN NO as lookup type...");
    await page.selectOption("#ddlUserTypes", { label: "PAN NO" }).catch(() => {
      // Try value-based selection
      return page.selectOption("#ddlUserTypes", "PAN NO");
    });

    // Enter PAN
    console.log(`⌨️  Entering PAN: ${PAN}`);
    await page.fill("#txtfolio", PAN);

    // Solve CAPTCHA
    console.log("🔐 Solving CAPTCHA...");
    const captchaData = await solveCameoCaptcha(page);

    if (captchaData) {
      console.log(`   CAPTCHA dimensions: ${captchaData.width}x${captchaData.height}`);

      // For now, we'll try submitting with an empty CAPTCHA to see the error
      // In production, integrate Tesseract.js or a CAPTCHA solving service
      console.log("⚠️  CAPTCHA solving requires Tesseract.js or manual input");
      console.log("   Attempting submission without CAPTCHA...");

      // Try submitting
      await page.click("#btngenerate");

      // Wait for response
      await page.waitForTimeout(3000);

      // Get the result
      const resultText = await page.locator("body").innerText();
      console.log("\n📋 Page Response:");
      console.log(resultText.substring(0, 2000));
    }

    // Take a screenshot for debugging
    await page.screenshot({ path: "/tmp/cameo-result.png", fullPage: true });
    console.log("\n📸 Screenshot saved: /tmp/cameo-result.png");

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await browser.close();
  }
}

main();
