import { toIpoSlug } from "@/lib/ipo-slug";
import { ipobharosaUserAgent } from "@/lib/site-url";
import type { GmpAdapter } from "../types";
import type { ProviderResult } from "@/lib/ingestion/provider-result";

const GMP_URL = "https://ipotrack.in/ipo-gmp";

/**
 * IPO Track (ipotrack.in) publishes a live GMP dashboard. The page is a
 * Next.js app whose payload embeds each IPO as a JSON fragment shaped like
 * {"title": "...", "url": "https://ipotrack.in/ipo/<slug>", "gmp": "₹33",
 * "gain": "34.02%"}. Quotes appear with rupee or bare-number formatting and
 * the embedded payload escapes quotes as \".
 */
export function findIpoTrackGmp(companyName: string, html: string): ProviderResult<number> {
  const expected = toIpoSlug(companyName);
  const unescaped = html.replace(/\\"/g, '"');
  const rowRe = /"title":"([^"]+)","url":"https:\/\/ipotrack\.in\/ipo\/([^"]+)","gmp":"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(unescaped)) !== null) {
    const [, title, slug, rawGmp] = match;
    if (toIpoSlug(title) === expected || slug === expected) {
      const value = parseFloat(rawGmp.replace(/[₹,\s]/g, ""));
      if (Number.isNaN(value)) {
        throw new Error(`ipotrack: gmp "${rawGmp}" is not a number for "${companyName}"`);
      }
      return { kind: "VALUE", value };
    }
  }
  return { kind: "NOT_COVERED", reason: `IPO Track has no GMP row for ${companyName}` };
}

export const ipoTrackAdapter: GmpAdapter = {
  key: "ipotrack",
  name: "IPO Track",
  async fetchGmp(companyName: string): Promise<ProviderResult<number>> {
    const response = await fetch(GMP_URL, {
      headers: { "User-Agent": ipobharosaUserAgent() },
    });
    if (!response.ok) throw new Error(`ipotrack: HTTP ${response.status}`);
    return findIpoTrackGmp(companyName, await response.text());
  },
};