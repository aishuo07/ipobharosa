import * as cheerio from "cheerio";
import type { SubscriptionAdapter } from "../types";
import { toIpoSlug } from "@/lib/ipo-slug";

import { ipobharosaUserAgent } from "@/lib/site-url";

const USER_AGENT = ipobharosaUserAgent();

function parseNum(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (t === "upcoming" || t === "" || t === "-") return null;
  const match = t.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * Sahi republishes NSE's own day-by-day subscription table
 * (QIB (Ex Anchor) / NII / Retail / [EMP] / Total — the EMP column is
 * present for some IPOs and absent for others), explicitly attributed
 * "Source: NSE" on the page. We take the most recent row that has
 * actually reported numbers (later rows read "upcoming" until that
 * day's bidding closes).
 */
export const sahiSubscriptionAdapter: SubscriptionAdapter = {
  key: "sahi-subscription",
  name: "Sahi (NSE-sourced subscription table)",
  async fetchSubscription(companyName: string) {
    const slug = toIpoSlug(companyName);
    const url = `https://www.sahi.com/blogs/${slug}-ipo-gmp-today`;

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 404) return { kind: "NOT_COVERED", reason: `Sahi has no subscription page for ${companyName}` };
    if (!res.ok) throw new Error(`sahi-subscription: HTTP ${res.status} for ${url}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const tableEl = $("table")
      .toArray()
      .find((el) => {
        const headerText = $(el).find("tr").first().find("th, td").text();
        return /QIB/i.test(headerText) && /NII/i.test(headerText) && /Retail/i.test(headerText);
      });
    if (!tableEl) {
      return { kind: "NOT_COVERED", reason: `Sahi page does not provide a subscription table for ${companyName}` };
    }
    const table = $(tableEl);

    const headerCells = table.find("tr").first().find("th, td");
    const hasEmployeeColumn = headerCells
      .toArray()
      .some((c) => /^\s*EMP\s*$/i.test($(c).text()));

    const rows = table.find("tr").toArray().slice(1); // drop header row
    let latestComplete: { qibX: number; niiX: number; retailX: number; employeeX: number | null } | null = null;

    for (const row of rows) {
      const cells = $(row).find("th, td").toArray().map((c) => $(c).text());
      // Columns are [Date, QIB, NII, Retail, EMP?, Total] — EMP is only
      // present for some IPOs, so index it explicitly rather than by
      // fixed position.
      const qibX = parseNum(cells[1] ?? "");
      const niiX = parseNum(cells[2] ?? "");
      const retailX = parseNum(cells[3] ?? "");
      const employeeX = hasEmployeeColumn ? parseNum(cells[4] ?? "") : null;
      if (qibX === null || niiX === null || retailX === null) continue; // "upcoming" day
      latestComplete = { qibX, niiX, retailX, employeeX };
    }

    if (!latestComplete) {
      return { kind: "NOT_YET_AVAILABLE", reason: `No completed exchange subscription row is published yet for ${companyName}` };
    }

    return { kind: "VALUE", value: { ...latestComplete, sourceExchange: "nse" } };
  },
};
