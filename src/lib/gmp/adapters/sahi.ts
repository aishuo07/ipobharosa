import type { GmpAdapter } from "../types";
import { toIpoSlug } from "@/lib/ipo-slug";

const USER_AGENT =
  "Mozilla/5.0 (compatible; IPODekhoBot/1.0; +https://ipodekho-ten.vercel.app)";

// Sahi's articles state the figure inconsistently — sometimes in the meta
// description ("GMP today is ₹259"), sometimes only in the article body
// ("GMP today (10th Aug 2026) stands at ₹23, up 10.85%..."). Match either.
const GMP_PATTERN = /GMP\s+today[^₹]{0,80}₹\s*(-?\d+(?:\.\d+)?)/i;

export const sahiAdapter: GmpAdapter = {
  key: "sahi",
  name: "Sahi",
  async fetchGmp(companyName: string): Promise<number> {
    const slug = toIpoSlug(companyName);
    const url = `https://www.sahi.com/blogs/${slug}-ipo-gmp-today`;

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`sahi: HTTP ${res.status} for ${url}`);
    const html = await res.text();

    const match = html.match(GMP_PATTERN);
    if (!match) {
      throw new Error(`sahi: could not find a GMP figure for "${companyName}" at ${url}`);
    }
    return parseFloat(match[1]);
  },
};
