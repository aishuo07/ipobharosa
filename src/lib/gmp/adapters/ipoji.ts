import * as cheerio from "cheerio";
import type { GmpAdapter } from "../types";
import { toIpoSlug } from "@/lib/ipo-slug";

import { ipobharosaUserAgent } from "@/lib/site-url";

const USER_AGENT = ipobharosaUserAgent();

export const ipojiAdapter: GmpAdapter = {
  key: "ipoji",
  name: "IPO Ji",
  async fetchGmp(companyName: string) {
    const slug = toIpoSlug(companyName);
    const url = `https://www.ipoji.com/ipo/${slug}-ipo`;

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 404) return { kind: "NOT_COVERED", reason: `IPO Ji has no GMP page for ${companyName}` };
    if (!res.ok) throw new Error(`ipoji: HTTP ${res.status} for ${url}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // ipoji renders the current GMP as a structured data attribute —
    // far more robust than scraping display text.
    const raw = $('[data-metric="gmp-value"]').attr("data-value");
    if (!raw) {
      return { kind: "NOT_YET_AVAILABLE", reason: `IPO Ji page exists but has no published GMP quote for ${companyName}` };
    }
    const value = parseFloat(raw);
    if (Number.isNaN(value)) {
      throw new Error(`ipoji: gmp-value attribute "${raw}" is not a number for "${companyName}"`);
    }
    return { kind: "VALUE", value };
  },
};
