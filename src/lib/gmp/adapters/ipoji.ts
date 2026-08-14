import * as cheerio from "cheerio";
import type { GmpAdapter } from "../types";
import { toIpoSlug } from "@/lib/ipo-slug";

import { ipobharosaUserAgent } from "@/lib/site-url";

const USER_AGENT = ipobharosaUserAgent();

export const ipojiAdapter: GmpAdapter = {
  key: "ipoji",
  name: "IPO Ji",
  async fetchGmp(companyName: string): Promise<number> {
    const slug = toIpoSlug(companyName);
    const url = `https://www.ipoji.com/ipo/${slug}-ipo`;

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`ipoji: HTTP ${res.status} for ${url}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // ipoji renders the current GMP as a structured data attribute —
    // far more robust than scraping display text.
    const raw = $('[data-metric="gmp-value"]').attr("data-value");
    if (!raw) {
      throw new Error(`ipoji: could not find gmp-value data attribute for "${companyName}" at ${url}`);
    }
    const value = parseFloat(raw);
    if (Number.isNaN(value)) {
      throw new Error(`ipoji: gmp-value attribute "${raw}" is not a number for "${companyName}"`);
    }
    return value;
  },
};
