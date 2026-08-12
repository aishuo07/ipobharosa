import * as cheerio from "cheerio";
import type { IpoFacts } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (compatible; IPOBharosaBot/1.0; +https://ipobharosa.vercel.app)";
const FETCH_TIMEOUT_MS = 15000;

export function parseCr(text: string): number | null {
  const match = text.replace(/,/g, "").match(/([\d.]+)\s*Cr/i);
  return match ? parseFloat(match[1]) : null;
}

export function parsePriceBand(text: string): { low: number; high: number } | null {
  const cleaned = text.replace(/,/g, "");
  const range = cleaned.match(/₹\s*([\d.]+)\s*to\s*₹?\s*([\d.]+)/i);
  if (range) return { low: parseFloat(range[1]), high: parseFloat(range[2]) };

  // Some issues (mostly small SME ones) are priced at a single fixed
  // value rather than a band, e.g. "₹130 Per Share" — treat that as a
  // zero-width band rather than failing to parse it at all.
  const fixed = cleaned.match(/₹\s*([\d.]+)\s*Per Share/i);
  return fixed ? { low: parseFloat(fixed[1]), high: parseFloat(fixed[1]) } : null;
}

export function parseIpoDate(text: string | undefined): Date | null {
  if (!text) return null;
  const d = new Date(text.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ipowatch.in's per-IPO page has a real, structured "IPO Details" table
 * and a separate "IPO Dates" table with the full 5-date lifecycle — both
 * are plain key/value <table> rows inside <figure class="wp-block-table">
 * elements, keys sometimes ending in a colon depending on which of the
 * two tables it came from. Normalizing the trailing colon away lets both
 * tables merge into one lookup without caring which table a field came
 * from.
 */
export async function fetchIpoFacts(
  detailUrl: string,
  companyName: string,
  board: "MAINBOARD" | "SME",
): Promise<IpoFacts> {
  const res = await fetch(detailUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ipowatch facts: HTTP ${res.status} for ${detailUrl}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const facts = new Map<string, string>();
  let drhpUrl: string | null = null;
  let rhpUrl: string | null = null;
  $("figure.wp-block-table table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;
    const key = $(cells[0]).text().trim().replace(/:$/, "");
    // The DRHP/RHP rows hold a bare <a><img></a> with no visible text —
    // the link itself is what we need, not the (empty) cell text.
    if (/^DRHP/i.test(key)) drhpUrl ??= $(cells[1]).find("a").attr("href") ?? null;
    if (/^RHP/i.test(key)) rhpUrl ??= $(cells[1]).find("a").attr("href") ?? null;
    const value = $(cells[1]).text().trim();
    if (key && value && !facts.has(key)) facts.set(key, value);
  });

  const priceBand = parsePriceBand(facts.get("IPO Price Band") ?? "");
  if (!priceBand) {
    throw new Error(`ipowatch facts: could not parse price band for "${companyName}" at ${detailUrl}`);
  }

  const issueSizeCr = parseCr(facts.get("Issue Size") ?? "");
  if (issueSizeCr === null) {
    throw new Error(`ipowatch facts: could not parse issue size for "${companyName}" at ${detailUrl}`);
  }

  const freshIssueCr = parseCr(facts.get("Fresh Issue") ?? "");
  // "Offer for Sale" is sometimes given in Cr, sometimes in a raw share
  // count ("Approx 1,00,00,000 Equity Shares") — when it isn't Cr-
  // denominated, fall back to issue size minus fresh issue.
  const ofsDirectCr = parseCr(facts.get("Offer for Sale") ?? "");
  const ofsCr = ofsDirectCr ?? (freshIssueCr !== null ? Math.max(0, issueSizeCr - freshIssueCr) : null);

  const openDate = parseIpoDate(facts.get("IPO Open Date"));
  const closeDate = parseIpoDate(facts.get("IPO Close Date"));
  const allotmentDate = parseIpoDate(facts.get("Basis of Allotment"));
  const refundDate = parseIpoDate(facts.get("Refunds"));
  const listingDate = parseIpoDate(facts.get("IPO Listing Date"));
  if (!openDate || !closeDate || !allotmentDate || !refundDate || !listingDate) {
    throw new Error(`ipowatch facts: missing one or more lifecycle dates for "${companyName}" at ${detailUrl}`);
  }

  // Market-lot table: header-indexed (not fixed-position) since the exact
  // column order isn't guaranteed — find whichever row starts with
  // "Retail Minimum" and read its "Shares" column.
  let lotSize: number | null = null;
  $("table").each((_, table) => {
    if (lotSize !== null) return;
    const $table = $(table);
    const headerCells = $table.find("tr").first().find("td, th").toArray().map((c) => $(c).text().trim());
    const sharesIdx = headerCells.findIndex((h) => /^shares$/i.test(h));
    if (sharesIdx === -1) return;
    const row = $table.find("tr").toArray().find((tr) => /retail minimum/i.test($(tr).find("td").first().text()));
    if (!row) return;
    const cell = $(row).find("td").eq(sharesIdx).text().replace(/,/g, "").trim();
    const n = parseInt(cell, 10);
    if (!Number.isNaN(n)) lotSize = n;
  });
  if (lotSize === null) {
    throw new Error(`ipowatch facts: could not find market lot size for "${companyName}" at ${detailUrl}`);
  }

  // Some pages carry an earlier, unrelated boilerplate/teaser section that
  // also contains a "Lead Managers"/"Registrar" heading before the real
  // one for this specific IPO — the real, company-specific section always
  // comes last on the page, so `.last()` rather than `.first()` here.
  const registrarHeading = $('h2:contains("IPO Registrar")').last();
  const registrarHtml = registrarHeading.next("p").html() ?? "";
  const registrar = registrarHtml.split(/<br\s*\/?>/i)[0]?.replace(/<[^>]+>/g, "").trim();
  if (!registrar) {
    throw new Error(`ipowatch facts: could not find registrar for "${companyName}" at ${detailUrl}`);
  }

  const leadManagersHeading = $('h2:contains("Lead Managers")').last();
  const leadManagers = leadManagersHeading
    .nextAll("ul")
    .first()
    .find("li")
    .map((_, li) => $(li).text().trim())
    .get()
    .filter(Boolean);
  if (leadManagers.length === 0) {
    throw new Error(`ipowatch facts: could not find lead managers for "${companyName}" at ${detailUrl}`);
  }

  return {
    companyName,
    board,
    priceBandLow: priceBand.low,
    priceBandHigh: priceBand.high,
    lotSize,
    issueSizeCr,
    freshIssueCr,
    ofsCr,
    openDate,
    closeDate,
    allotmentDate,
    refundDate,
    listingDate,
    registrar,
    leadManagers,
    drhpUrl,
    rhpUrl,
  };
}
