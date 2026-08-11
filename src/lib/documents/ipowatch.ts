import * as cheerio from "cheerio";
import { toIpoSlug } from "@/lib/ipo-slug";

const USER_AGENT =
  "Mozilla/5.0 (compatible; IPOBharosaBot/1.0; +https://ipobharosa.vercel.app)";

export type IpoDocument = { label: string; url: string; docType: string };

function inferDocType(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("drhp")) return "drhp";
  if (lower.includes("rhp")) return "rhp";
  if (lower.includes("anchor")) return "anchor";
  return "other";
}

/**
 * ipowatch.in lists each IPO's real DRHP/RHP PDF links (sourced from the
 * lead manager's or company's own site) in a plain HTML table — the
 * label lives in the row's first <td>, the link in an <a> further along
 * the same row.
 */
export async function fetchDocumentsFromIpowatch(companyName: string): Promise<IpoDocument[]> {
  const slug = toIpoSlug(companyName);
  const url = `https://ipowatch.in/${slug}-ipo-gmp-grey-market-premium/`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`ipowatch documents: HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const documents: IpoDocument[] = [];
  $("tr").each((_, row) => {
    const $row = $(row);
    const pdfLink = $row.find('a[href$=".pdf"], a[href*=".pdf?"]').first();
    if (!pdfLink.length) return;
    const href = pdfLink.attr("href");
    if (!href) return;

    const label = $row.find("td").first().text().trim();
    if (!label) return;

    documents.push({ label, url: href, docType: inferDocType(label) });
  });

  if (documents.length === 0) {
    throw new Error(`ipowatch documents: no PDF links found for "${companyName}" at ${url}`);
  }
  return documents;
}
