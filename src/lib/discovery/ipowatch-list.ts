import * as cheerio from "cheerio";
import type { IpoListingCandidate } from "./types";

import { ipobharosaUserAgent } from "@/lib/site-url";

const USER_AGENT = ipobharosaUserAgent();
const LIST_URL = "https://ipowatch.in/upcoming-ipo-list/";
const FETCH_TIMEOUT_MS = 15000;
const RECENT_CLOSE_LOOKBACK_DAYS = 45;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9,
  october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/** Parse the closing day from labels such as "24-26 August". */
export function parseListingCloseDate(label: string, now: Date): Date | null {
  const match = label.trim().match(/^\d{1,2}\s*-\s*(\d{1,2})\s+([A-Za-z]+)$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined || day < 1 || day > 31) return null;

  // The page is a current-year ledger. The one boundary exception is a
  // December page already advertising January IPOs for the following year.
  const year = now.getUTCMonth() === 11 && month === 0
    ? now.getUTCFullYear() + 1
    : now.getUTCFullYear();
  const date = new Date(Date.UTC(year, month, day, 12));
  return date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

/**
 * ipowatch.in's single "upcoming IPO list" page has two real WordPress
 * TablePress tables — mainboard and SME — identified by the `tablepress`
 * class (a third, unrelated table further down the page lists
 * speculative "someday" mega-IPOs like Reliance Jio/PhonePe with "TBA"
 * fields everywhere; it isn't a `tablepress` table, so it's naturally
 * excluded here rather than needing a special case). SME rows are
 * distinguished by a "Platform" column the mainboard table doesn't have.
 */
export async function fetchIpoListing(now = new Date()): Promise<IpoListingCandidate[]> {
  const res = await fetch(LIST_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ipowatch listing: HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const candidates: IpoListingCandidate[] = [];

  $("table.tablepress").each((_, table) => {
    const $table = $(table);
    const headerCells = $table.find("thead th").map((_, th) => $(th).text().trim()).get();
    if (headerCells.length === 0) return;
    const board: "MAINBOARD" | "SME" = headerCells.includes("Platform") ? "SME" : "MAINBOARD";

    $table.find("tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      const link = cells.first().find("a").first();
      const companyName = link.text().trim();
      const detailUrl = link.attr("href");
      if (!companyName || !detailUrl) return;
      const dateLabel = cells.eq(1).text().trim();
      const closeDate = parseListingCloseDate(dateLabel, now);
      candidates.push({ companyName, detailUrl, board, dateLabel, ...(closeDate ? { closeDate } : {}) });
    });
  });

  const cutoff = new Date(now.getTime() - RECENT_CLOSE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  // Unparseable/TBA rows from the two curated tables stay visible to the
  // validation pipeline; dated rows older than the useful recent window do
  // not consume the human-review queue.
  return candidates.filter((candidate) => !candidate.closeDate || candidate.closeDate >= cutoff);
}
