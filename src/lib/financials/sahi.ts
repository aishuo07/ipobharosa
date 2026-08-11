import * as cheerio from "cheerio";
import { toIpoSlug } from "@/lib/ipo-slug";

const USER_AGENT =
  "Mozilla/5.0 (compatible; IPOBharosaBot/1.0; +https://ipobharosa.vercel.app)";

export type FinancialYear = {
  fiscalYear: string;
  revenueCr: number | null;
  patCr: number | null;
  peRatio: number | null;
  ronwPct: number | null;
  debtEquity: number | null;
  eps: number | null;
};

function parseNum(text: string): number | null {
  const t = text.replace(/,/g, "").trim();
  if (t === "" || t === "-" || t === "—") return null;
  const match = t.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * sahi.com renders a real "Period Ended" financial table per IPO —
 * one row per metric (Revenue from Ops, PAT, ROE, Debt-Equity, ...),
 * one column per fiscal year. A separate peer-comparison table on the
 * same page lists the company's own EPS/P-E among its listed peers.
 */
export async function fetchFinancialsFromSahi(companyName: string): Promise<FinancialYear[]> {
  const slug = toIpoSlug(companyName);
  const url = `https://www.sahi.com/blogs/${slug}-ipo-gmp-today`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`sahi financials: HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const finTableEl = $("table")
    .toArray()
    .find((el) => /Period Ended/i.test($(el).find("tr").first().text()));
  if (!finTableEl) {
    throw new Error(`sahi financials: no financial performance table found for "${companyName}" at ${url}`);
  }
  const finTable = $(finTableEl);
  const finRows = finTable.find("tr").toArray();

  const years = $(finRows[0])
    .find("th, td")
    .toArray()
    .slice(1)
    .map((c) => $(c).text().trim());

  const metrics: Record<string, string[]> = {};
  for (const row of finRows.slice(1)) {
    const cells = $(row).find("th, td").toArray();
    const label = $(cells[0]).text().trim().toLowerCase();
    const values = cells.slice(1).map((c) => $(c).text().trim());
    metrics[label] = values;
  }

  function findMetric(include: string[], exclude: string[] = []): string[] | null {
    const key = Object.keys(metrics).find(
      (k) => include.every((kw) => k.includes(kw)) && !exclude.some((kw) => k.includes(kw)),
    );
    return key ? metrics[key] : null;
  }

  const revenue = findMetric(["revenue"]);
  const pat = findMetric(["pat"], ["margin"]);
  const roe = findMetric(["roe"]);
  const debtEquity = findMetric(["debt", "equity"]);

  // Peer-comparison table: same company listed among its peers with its
  // own EPS/P-E, in a separate "Company | EPS | P/E" table.
  let eps: number | null = null;
  let peRatio: number | null = null;
  const peerTableEl = $("table")
    .toArray()
    .find((el) => /EPS/i.test($(el).find("tr").first().text()) && /P\/E/i.test($(el).find("tr").first().text()));
  if (peerTableEl) {
    const companyFirstWord = companyName.split(" ")[0].toLowerCase();
    $(peerTableEl)
      .find("tr")
      .toArray()
      .slice(1)
      .forEach((row) => {
        const cells = $(row).find("th, td").toArray();
        const rowLabel = $(cells[0]).text().trim().toLowerCase();
        if (rowLabel.includes(companyFirstWord)) {
          eps = parseNum($(cells[1]).text());
          peRatio = parseNum($(cells[2]).text());
        }
      });
  }

  return years.map((fiscalYear, i) => ({
    fiscalYear,
    revenueCr: revenue ? parseNum(revenue[i]) : null,
    patCr: pat ? parseNum(pat[i]) : null,
    peRatio: i === 0 ? peRatio : null, // peer comparison is "as of" the latest year only
    ronwPct: roe ? parseNum(roe[i]) : null,
    debtEquity: debtEquity ? parseNum(debtEquity[i]) : null,
    eps: i === 0 ? eps : null,
  }));
}
