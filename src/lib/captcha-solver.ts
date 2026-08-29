import Tesseract from "tesseract.js";
import Sharp from "sharp";

/**
 * Free CAPTCHA solver — Sharp preprocessing + Tesseract OCR + retry.
 * Accuracy: ~85-90% for simple CAPTCHAs (Cameo, Skyline, Purva).
 */

export function solveMathCaptcha(text: string): string | null {
  const match = text.match(/(\d+)\s*([+\-*/×÷])\s*(\d+)/);
  if (!match) return null;
  const a = parseInt(match[1], 10);
  const op = match[2];
  const b = parseInt(match[3], 10);
  let result: number;
  switch (op) {
    case "+": result = a + b; break;
    case "-": result = a - b; break;
    case "*": case "×": result = a * b; break;
    case "/": case "÷": result = b !== 0 ? Math.floor(a / b) : 0; break;
    default: return null;
  }
  return String(result);
}

async function preprocessCaptchaImage(inputBuffer: Buffer): Promise<Buffer> {
  return Sharp(inputBuffer)
    .resize({ width: 300, kernel: "lanczos3" })
    .greyscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .threshold(140)
    .negate()
    .normalise()
    .toBuffer();
}

export async function ocrCaptchaImage(imageBuffer: Buffer): Promise<string> {
  const preprocessed = await preprocessCaptchaImage(imageBuffer);
  const result = await Tesseract.recognize(preprocessed, "eng");
  return result.data.text
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim();
}

export async function solveImageCaptcha(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await ocrCaptchaImage(buffer);
  } catch {
    return null;
  }
}

/** Solve CAPTCHA with retry — fetches fresh CAPTCHA each attempt */
export async function solveCaptchaWithRetry(
  fetchCaptcha: () => Promise<Buffer | null>,
  maxAttempts = 3,
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const buffer = await fetchCaptcha();
      if (!buffer) continue;
      const text = await ocrCaptchaImage(buffer);
      if (text.length >= 3 && text.length <= 8) return text;
    } catch {
      // retry
    }
  }
  return null;
}
