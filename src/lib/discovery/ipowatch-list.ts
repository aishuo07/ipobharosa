import * as cheerio from "cheerio";
import type { IpoListingCandidate } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (compatible; IPOBharosaBot/1.0; +https://ipobharosa.vercel.app)";
const LIST_URL = "https://ipowatch.in/upcoming-ipo-list/";
const FETCH_TIMEOUT_MS = 15000;

// The listing table goes back months (every IPO ipowatch has ever
// tracked, newest first) — capping to the most recent rows per board
// keeps each run fast and avoids treating IPOs from months ago as "new"
// just because we haven't seen them before.
const MAX_ROWS_PER_BOARD = 20;

/**
 * ipowatch.in's single "upcoming IPO list" page has two real WordPress
 * TablePress tables — mainboard and SME — identified by the `tablepress`
 * class (a third, unrelated table further down the page lists
 * speculative "someday" mega-IPOs like Reliance Jio/PhonePe with "TBA"
 * fields everywhere; it isn't a `tablepress` table, so it's naturally
 * excluded here rather than needing a special case). SME rows are
 * distinguished by a "Platform" column the mainboard table doesn't have.
 */
export async function fetchIpoListing(): Promise<IpoListingCandidate[]> {
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

    const boardCandidates: IpoListingCandidate[] = [];
    $table.find("tbody tr").each((_, row) => {
      const link = $(row).find("td").first().find("a").first();
      const companyName = link.text().trim();
      const detailUrl = link.attr("href");
      if (!companyName || !detailUrl) return;
      boardCandidates.push({ companyName, detailUrl, board });
    });
    candidates.push(...boardCandidates.slice(0, MAX_ROWS_PER_BOARD));
  });

  return candidates;
}
