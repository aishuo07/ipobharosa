import * as cheerio from "cheerio";
import type { GmpAdapter } from "../types";
import { toIpoSlug } from "@/lib/ipo-slug";

import { ipobharosaUserAgent } from "@/lib/site-url";

const USER_AGENT = ipobharosaUserAgent();

export const ipoWatchAdapter: GmpAdapter = {
  key: "ipowatch",
  name: "IPO Watch",
  async fetchGmp(companyName: string): Promise<number> {
    const slug = toIpoSlug(companyName);
    const url = `https://ipowatch.in/${slug}-ipo-gmp-grey-market-premium/`;

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`ipowatch: HTTP ${res.status} for ${url}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    let latestGmp: number | null = null;
    $("table").each((_, table) => {
      if (latestGmp !== null) return;
      const rows = $(table).find("tr");
      const headerText = rows.first().text();
      if (!/IPO GMP/i.test(headerText)) return;

      // Header row is [Date, IPO GMP, GMP Trend, Gain, Last Updated] —
      // the first data row is the most recent entry.
      const firstDataRow = rows.eq(1);
      const gmpCellText = firstDataRow.find("td").eq(1).text();
      const match = gmpCellText.match(/-?\d+(\.\d+)?/);
      if (match) latestGmp = parseFloat(match[0]);
    });

    if (latestGmp === null) {
      throw new Error(`ipowatch: could not locate GMP table for "${companyName}" at ${url}`);
    }
    return latestGmp;
  },
};
