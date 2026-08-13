import { normalizeIssuerName, parseIndianDate, parseInteger, parsePriceBand, splitManagers } from "./normalization";
import type { OfficialEvidenceResult, OfficialIpoEvidence, OfficialIpoSource } from "./types";

const CATALOGUE_URL = "https://www.nseindia.com/api/all-upcoming-issues?category=ipo";
const FETCH_TIMEOUT_MS = 15_000;
const HEADERS = {
  Accept: "application/json,text/plain,*/*",
  // NSE's edge currently stalls (rather than returning a status) for the
  // previous custom `compatible; ...Bot` UA. Use a normal browser UA; this
  // is still the public website endpoint and does not bypass authentication.
  "User-Agent": "Mozilla/5.0",
  Referer: "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
};

export type NseCatalogueIssue = {
  companyName?: string;
  issueStartDate?: string;
  issueEndDate?: string;
  issuePrice?: string;
  priceBand?: string;
  lotSize?: string | number;
  series?: string;
  status?: string;
  symbol?: string;
};

type NseDetail = {
  issueInfo?: {
    dataList?: Array<{ title?: string | null; value?: string | null }>;
  };
};

function cleanValue(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/^"|"$/g, "");
  return cleaned || null;
}

function detailMap(detail: NseDetail): Map<string, string> {
  return new Map(
    (detail.issueInfo?.dataList ?? [])
      .filter((row): row is { title: string; value?: string | null } => Boolean(row.title))
      .map((row) => [row.title.trim().toLowerCase(), cleanValue(row.value) ?? ""]),
  );
}

export function selectNseIssue(rows: NseCatalogueIssue[], companyName: string): NseCatalogueIssue | null {
  const target = normalizeIssuerName(companyName);
  return rows.find((row) => row.companyName && normalizeIssuerName(row.companyName) === target) ?? null;
}

export function parseNseDetail(issue: NseCatalogueIssue, detail: NseDetail, capturedAt = new Date()): OfficialIpoEvidence {
  const values = detailMap(detail);
  const period = values.get("issue period")?.split(/\s+to\s+/i) ?? [];
  const price = parsePriceBand(values.get("price range") ?? issue.priceBand ?? issue.issuePrice);
  const sourceUrl = `https://www.nseindia.com/market-data/issue-information?series=${encodeURIComponent(issue.series ?? "")}&symbol=${encodeURIComponent(issue.symbol ?? "")}&type=${encodeURIComponent(issue.status ?? "")}`;
  const companyName = cleanValue(issue.companyName) ?? cleanValue(detail.issueInfo?.dataList?.[0]?.title);
  const openDateText = period[0] ?? issue.issueStartDate;
  const closeDateText = period[1] ?? issue.issueEndDate;
  const rhpUrl = cleanValue(values.get("red herring prospectus"));

  const facts = {
    companyName,
    board: issue.series === "SME" ? "SME" as const : issue.series === "EQ" ? "MAINBOARD" as const : null,
    priceBandLow: price?.low ?? null,
    priceBandHigh: price?.high ?? null,
    lotSize: parseInteger(values.get("bid lot") ?? issue.lotSize),
    openDate: openDateText ? parseIndianDate(openDateText) : null,
    closeDate: closeDateText ? parseIndianDate(closeDateText) : null,
    registrar: cleanValue(values.get("name of the registrar")),
    leadManagers: splitManagers(values.get("book running lead managers")),
    rhpUrl,
  };
  const fieldSources = Object.fromEntries(
    Object.entries(facts).filter(([, value]) => value !== null && (!Array.isArray(value) || value.length > 0)).map(([field]) => [field, sourceUrl]),
  );

  return { source: "NSE", sourceUrl, capturedAt, facts, fieldSources, raw: { issue, detail } };
}

async function getJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (!response.ok) throw new Error(`NSE HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export class NseOfficialSource implements OfficialIpoSource {
  readonly source = "NSE" as const;
  private cataloguePromise: Promise<NseCatalogueIssue[]> | null = null;
  private catalogueExpiresAt = 0;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private getCatalogue(): Promise<NseCatalogueIssue[]> {
    if (!this.cataloguePromise || Date.now() >= this.catalogueExpiresAt) {
      this.cataloguePromise = getJson<NseCatalogueIssue[]>(CATALOGUE_URL, this.fetchImpl);
      this.catalogueExpiresAt = Date.now() + 60_000;
    }
    return this.cataloguePromise;
  }

  async findEvidence(companyName: string): Promise<OfficialEvidenceResult> {
    let catalogue: NseCatalogueIssue[];
    try {
      catalogue = await this.getCatalogue();
    } catch (error) {
      // Share one failure across the current batch, then retry on the next
      // ingestion cycle after the short catalogue TTL instead of issuing the
      // same doomed request once per candidate.
      return { status: "UNAVAILABLE", reason: (error as Error).message };
    }
    const issue = selectNseIssue(catalogue, companyName);
    if (!issue?.symbol || !issue.series) return { status: "NOT_FOUND", reason: `${companyName} is not present in the current NSE IPO catalogue` };
    try {
      const detail = await getJson<NseDetail>(
        `https://www.nseindia.com/api/ipo-detail?symbol=${encodeURIComponent(issue.symbol)}&series=${encodeURIComponent(issue.series)}`,
        this.fetchImpl,
      );
      return { status: "FOUND", evidence: parseNseDetail(issue, detail) };
    } catch (error) {
      return { status: "UNAVAILABLE", reason: (error as Error).message };
    }
  }
}
