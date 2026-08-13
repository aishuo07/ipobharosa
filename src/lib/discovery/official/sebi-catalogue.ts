import * as cheerio from "cheerio";
import { normalizeIssuerName } from "./normalization";

export type FilingStage = "DRHP_FILED" | "RHP_FILED";

export type OfficialFilingEntry = {
  issuerKey: string;
  companyName: string;
  stage: FilingStage;
  filingDate: Date;
  source: "SEBI";
  sourceUrl: string;
  documentUrl: string | null;
  raw: { title: string; filingDate: string };
};

const LISTING_ENDPOINT = "https://www.sebi.gov.in/sebiweb/ajax/home/getnewslistinfo.jsp";
const PAGES: Array<{ stage: FilingStage; url: string; smid: string; label: string }> = [
  {
    stage: "DRHP_FILED",
    smid: "10",
    label: "Draft Offer Documents filed with SEBI",
    url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=10&ssid=15",
  },
  {
    stage: "RHP_FILED",
    smid: "11",
    label: "Red Herring Documents filed with ROC",
    url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&smid=11&ssid=15",
  },
];

const HEADERS = { "User-Agent": "Mozilla/5.0", Accept: "text/html" };
const FETCH_TIMEOUT_MS = 10_000;

function cleanIssuer(title: string): string {
  const issuer = title
    .split(/<br\s*\/?\s*>/i)[0]
    .replace(/\s*[–—-]\s*(?:addendum|corrigendum)\s+to\s+(?:u?drhp|rhp).*$/i, "")
    .replace(/\s*[–—-]\s*(?:u?drhp|rhp|draft red herring prospectus|red herring prospectus).*$/i, "")
    .replace(/\s+u?drhp(?:[-\s]?[a-z0-9]+)?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (issuer !== issuer.toUpperCase()) return issuer;
  return issuer.toLowerCase().replace(/\b[a-z]+\b/g, (word) =>
    word.length <= 4 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1),
  );
}

export function parseSebiFilingPage(html: string, stage: FilingStage): OfficialFilingEntry[] {
  const $ = cheerio.load(html);
  const entries: OfficialFilingEntry[] = [];
  $("#sample_1 tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const filingDateText = cells.eq(0).text().trim();
    const link = cells.eq(1).children("a.points").first();
    const sourceUrl = link.attr("href")?.trim();
    const title = link.attr("title")?.trim() || link.clone().children().remove().end().text().trim();
    const companyName = cleanIssuer(title);
    const filingDate = new Date(`${filingDateText} 00:00:00 UTC`);
    if (!sourceUrl?.startsWith("https://www.sebi.gov.in/") || !companyName || Number.isNaN(filingDate.getTime())) return;
    const titleHtml = link.attr("title") ?? "";
    const documentUrl = titleHtml.match(/href\s*=\s*['"]([^'"]+)['"]/i)?.[1] ?? null;
    entries.push({
      issuerKey: normalizeIssuerName(companyName),
      companyName,
      stage,
      filingDate,
      source: "SEBI",
      sourceUrl,
      documentUrl: documentUrl?.startsWith("https://www.sebi.gov.in/") ? documentUrl : null,
      raw: { title, filingDate: filingDateText },
    });
  });
  return entries;
}

export async function fetchSebiFilingCatalogue(fetchImpl: typeof fetch = fetch): Promise<OfficialFilingEntry[]> {
  const pages = await Promise.all(PAGES.map(async ({ stage, url, smid, label }) => {
    const firstResponse = await fetchImpl(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!firstResponse.ok) throw new Error(`SEBI ${stage} catalogue: HTTP ${firstResponse.status}`);
    const body = new URLSearchParams({
      nextValue: "1",
      next: "n",
      search: "",
      fromDate: "",
      toDate: "",
      fromYear: "",
      toYear: "",
      deptId: "",
      sid: "3",
      ssid: "15",
      smid,
      ssidhidden: "15",
      intmid: "-1",
      sText: "Filings",
      ssText: "Public Issues",
      smText: label,
      doDirect: "1",
    });
    const secondResponse = await fetchImpl(LISTING_ENDPOINT, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded", Referer: url },
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!secondResponse.ok) throw new Error(`SEBI ${stage} catalogue page 2: HTTP ${secondResponse.status}`);
    const [firstHtml, secondHtml] = await Promise.all([firstResponse.text(), secondResponse.text()]);
    return [...parseSebiFilingPage(firstHtml, stage), ...parseSebiFilingPage(secondHtml.split("#@#")[0], stage)];
  }));
  return pages.flat();
}
