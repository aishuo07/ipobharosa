import Tesseract from "tesseract.js";

/**
 * Free CAPTCHA solver — runs locally, no API keys needed.
 *
 * - Math CAPTCHAs: parsed and solved with regex
 * - Image CAPTCHAs: OCR via Tesseract.js (runs in Node.js)
 */

/** Solve simple math CAPTCHAs like "3 + 5 = ?" or "12 - 7" */
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
    case "*":
    case "×": result = a * b; break;
    case "/":
    case "÷": result = b !== 0 ? Math.floor(a / b) : 0; break;
    default: return null;
  }
  return String(result);
}

/** OCR an image buffer and return cleaned text */
export async function ocrCaptchaImage(imageBuffer: Buffer): Promise<string> {
  const result = await Tesseract.recognize(imageBuffer, "eng");
  return result.data.text
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .trim();
}

/** Solve an image CAPTCHA from a URL */
export async function solveImageCaptcha(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return await ocrCaptchaImage(buffer);
  } catch {
    return null;
  }
}
