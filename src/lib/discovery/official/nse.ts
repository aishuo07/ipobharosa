import { extractHttpsUrl, issuerNamesMatch, normalizeIssuerName, parseDecimal, parseFlexibleIndianDate, parseIndianDate, parseInteger, parsePriceBand, splitManagers } from "./normalization";
import type { OfficialDemandSnapshot, OfficialDocument, OfficialEvidenceResult, OfficialIpoEnrichment, OfficialIpoEvidence, OfficialIpoSource } from "./types";
import { withTransientRetries } from "@/lib/ingestion/source-operation";

const CATALOGUE_URL = "https://www.nseindia.com/api/all-upcoming-issues?category=ipo";
const HISTORICAL_CATALOGUE_URL = "https://www.nseindia.com/api/public-past-issues";
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

export type NseHistoricalIssue = {
  company?: string;
  companyName?: string;
  ipoStartDate?: string;
  ipoEndDate?: string;
  issuePrice?: string | null;
  priceRange?: string | null;
  securityType?: string;
  symbol?: string;
  listingDate?: string;
};

type NseDetail = {
  issueInfo?: {
    dataList?: Array<{ title?: string | null; value?: string | null }>;
  };
  bidDetails?: Array<{
    category?: string | null;
    noOfTime?: string | number | null;
    srNo?: string | null;
  }>;
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

function documentKind(title: string): OfficialDocument["kind"] {
  if (/red herring prospectus/i.test(title)) return "RHP";
  if (/prospectus/i.test(title)) return "PROSPECTUS";
  if (/price band/i.test(title)) return "PRICE_BAND";
  if (/corrigendum|addendum/i.test(title)) return "CORRIGENDUM";
  if (/anchor/i.test(title)) return "ANCHOR";
  return "OTHER";
}

function officialDocuments(values: Map<string, string>): OfficialDocument[] {
  const documents: OfficialDocument[] = [];
  for (const [title, value] of values) {
    const url = extractHttpsUrl(value);
    if (!url || documents.some((document) => document.url === url)) continue;
    if (!/prospectus|ratio|basis|anchor|bidding center|application form|security parameter|corrigendum|addendum/i.test(title)) continue;
    documents.push({ label: title.replace(/^./, (letter) => letter.toUpperCase()), url, kind: documentKind(title) });
  }
  return documents;
}

function demandSnapshot(detail: NseDetail, sourceUrl: string, capturedAt: Date): OfficialDemandSnapshot | null {
  const rows = detail.bidDetails ?? [];
  const find = (pattern: RegExp, topLevel?: string) => rows.find((row) => pattern.test(row.category ?? "") && (!topLevel || row.srNo === topLevel));
  const multiple = (row: typeof rows[number] | undefined) => parseDecimal(row?.noOfTime);
  const qibX = multiple(find(/^Qualified Institutional Buyers/i, "1"));
  const niiX = multiple(find(/^Non Institutional Investors$/i, "2"));
  const retailX = multiple(find(/^Retail Individual Investors/i, "3"));
  const employeeX = multiple(find(/^Employees$/i, "4"));
  const totalX = multiple(find(/^Total$/i));
  if ([qibX, niiX, retailX, employeeX, totalX].every((value) => value === null)) return null;
  return { qibX, niiX, retailX, employeeX, totalX, capturedAt, sourceUrl };
}

export function selectNseIssue(rows: NseCatalogueIssue[], companyName: string): NseCatalogueIssue | null {
  const target = normalizeIssuerName(companyName);
  return rows.find((row) => row.companyName && normalizeIssuerName(row.companyName) === target) ?? null;
}

export function selectHistoricalNseIssue(rows: NseHistoricalIssue[], companyName: string): NseHistoricalIssue | null {
  const named = rows.filter((row) => row.company || row.companyName);
  const target = normalizeIssuerName(companyName);
  const exact = named.filter((row) => normalizeIssuerName(row.company ?? row.companyName!) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const compatible = named.filter((row) => issuerNamesMatch(row.company ?? row.companyName!, companyName));
  return compatible.length === 1 ? compatible[0] : null;
}

export type NseListing = {
  listingPrice: number;
  listingDate: Date;
};

/**
 * Resolves the real listing price + listing date for a company from NSE's
 * public past-issues catalogue. Returns null when the issue is closed but
 * not yet listed (NSE shows "-" for issuePrice before listing) or the row
 * cannot be uniquely matched.
 */
export function selectNseListing(rows: NseHistoricalIssue[], companyName: string): NseListing | null {
  const issue = selectHistoricalNseIssue(rows, companyName);
  if (!issue) return null;
  const rawPrice = issue.issuePrice?.trim();
  if (!rawPrice || rawPrice === "-") return null;
  const listingPrice = parseDecimal(rawPrice);
  if (listingPrice === null || listingPrice <= 0) return null;
  const listingDate = issue.listingDate ? parseFlexibleIndianDate(issue.listingDate) : null;
  if (!listingDate) return null;
  return { listingPrice, listingDate };
}

function historicalAsCatalogueIssue(issue: NseHistoricalIssue): NseCatalogueIssue {
  return {
    companyName: issue.company ?? issue.companyName,
    issueStartDate: issue.ipoStartDate,
    issueEndDate: issue.ipoEndDate,
    issuePrice: issue.issuePrice ?? undefined,
    priceBand: issue.priceRange ?? undefined,
    series: issue.securityType === "SME" ? "SME" : issue.securityType === "EQ" ? "EQ" : undefined,
    status: "Past",
    symbol: issue.symbol,
  };
}

export function parseNseDetail(issue: NseCatalogueIssue, detail: NseDetail, capturedAt = new Date()): OfficialIpoEvidence {
  const values = detailMap(detail);
  const period = values.get("issue period")?.split(/\s+to\s+/i) ?? [];
  const price = parsePriceBand(values.get("price range") ?? issue.priceBand ?? issue.issuePrice);
  const sourceUrl = `https://www.nseindia.com/market-data/issue-information?series=${encodeURIComponent(issue.series ?? "")}&symbol=${encodeURIComponent(issue.symbol ?? "")}&type=${encodeURIComponent(issue.status ?? "")}`;
  const companyName = cleanValue(issue.companyName) ?? cleanValue(detail.issueInfo?.dataList?.[0]?.title);
  const openDateText = period[0] ?? issue.issueStartDate;
  const closeDateText = period[1] ?? issue.issueEndDate;
  const rhpUrl = cleanValue(values.get("red herring prospectus") ?? values.get("prospectus"));
  const bidLot = parseInteger(values.get("bid lot") ?? values.get("lot size") ?? issue.lotSize);

  // `Ipo.lotSize` is the minimum application quantity used by the UI to
  // calculate minimum investment. NSE exposes one exchange bid lot; SME
  // individual applications require two lots, so retain the user-facing
  // minimum-quantity meaning instead of understating the required amount.
  const minimumApplicationQuantity = bidLot && issue.series === "SME" ? bidLot * 2 : bidLot;

  const facts = {
    companyName,
    board: issue.series === "SME" ? "SME" as const : issue.series === "EQ" ? "MAINBOARD" as const : null,
    priceBandLow: price?.low ?? null,
    priceBandHigh: price?.high ?? null,
    lotSize: minimumApplicationQuantity,
    openDate: openDateText ? parseIndianDate(openDateText) : null,
    closeDate: closeDateText ? parseIndianDate(closeDateText) : null,
    registrar: cleanValue(values.get("name of the registrar")),
    leadManagers: splitManagers(values.get("book running lead managers")),
    rhpUrl,
  };
  const documents = officialDocuments(values);
  const enrichment: OfficialIpoEnrichment = {
    issueType: "IPO",
    symbol: cleanValue(values.get("symbol") ?? issue.symbol),
    faceValue: parseDecimal(values.get("face value")),
    issueSizeShares: null,
    marketLot: bidLot,
    minimumBidQuantity: parseInteger(values.get("minimum order quantity")) ?? minimumApplicationQuantity,
    maximumRetailAmount: parseInteger(values.get("maximum subscription amount for retail investor")),
    maximumEmployeeAmount: parseInteger(values.get("maximum subscription amount for eligible employee")),
    maximumQibQuantity: parseInteger(values.get("maximum bid quantity for qib investors")),
    maximumNiiQuantity: parseInteger(values.get("maximum bid quantity for nib investors")),
    employeeDiscount: cleanValue(values.get("discount")),
    issueSizeDescription: cleanValue(values.get("issue size")),
    marketTimings: cleanValue(values.get("ipo market timings")),
    upiMandateCutoff: cleanValue(values.get("cut-off time for upi mandate confirmation")),
    sponsorBanks: splitManagers(values.get("sponsor bank")),
    documents,
    demand: demandSnapshot(detail, sourceUrl, capturedAt),
  };
  const fieldSources = Object.fromEntries(
    Object.entries(facts).filter(([, value]) => value !== null && (!Array.isArray(value) || value.length > 0)).map(([field]) => [field, sourceUrl]),
  );

  return { source: "NSE", sourceUrl, capturedAt, facts, enrichment, fieldSources, raw: { issue, detail } };
}

async function getJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  return withTransientRetries(async () => {
    const response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) throw new Error(`NSE HTTP ${response.status}`);
    return response.json() as Promise<T>;
  });
}

export class NseOfficialSource implements OfficialIpoSource {
  readonly source = "NSE" as const;
  private cataloguePromise: Promise<NseCatalogueIssue[]> | null = null;
  private catalogueExpiresAt = 0;
  private historicalCataloguePromise: Promise<NseHistoricalIssue[]> | null = null;
  private historicalCatalogueExpiresAt = 0;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private getCatalogue(): Promise<NseCatalogueIssue[]> {
    if (!this.cataloguePromise || Date.now() >= this.catalogueExpiresAt) {
      this.cataloguePromise = getJson<NseCatalogueIssue[]>(CATALOGUE_URL, this.fetchImpl);
      this.catalogueExpiresAt = Date.now() + 60_000;
    }
    return this.cataloguePromise;
  }

  private getHistoricalCatalogue(): Promise<NseHistoricalIssue[]> {
    if (!this.historicalCataloguePromise || Date.now() >= this.historicalCatalogueExpiresAt) {
      this.historicalCataloguePromise = getJson<NseHistoricalIssue[]>(HISTORICAL_CATALOGUE_URL, this.fetchImpl);
      this.historicalCatalogueExpiresAt = Date.now() + 60_000;
    }
    return this.historicalCataloguePromise;
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
    let issue = selectNseIssue(catalogue, companyName);
    if (!issue) {
      let historicalCatalogue: NseHistoricalIssue[];
      try {
        historicalCatalogue = await this.getHistoricalCatalogue();
      } catch (error) {
        return { status: "UNAVAILABLE", reason: `NSE historical catalogue unavailable: ${(error as Error).message}` };
      }
      const historicalIssue = selectHistoricalNseIssue(historicalCatalogue, companyName);
      if (historicalIssue) issue = historicalAsCatalogueIssue(historicalIssue);
    }
    if (!issue?.symbol || !issue.series) return { status: "NOT_FOUND", reason: `${companyName} is not present in NSE's current or historical IPO catalogues` };
    try {
      const detail = await getJson<NseDetail>(
        `https://www.nseindia.com/api/ipo-detail?symbol=${encodeURIComponent(issue.symbol)}&series=${encodeURIComponent(issue.series)}&type=${encodeURIComponent(issue.status ?? "")}`,
        this.fetchImpl,
      );
      return { status: "FOUND", evidence: parseNseDetail(issue, detail) };
    } catch (error) {
      return { status: "UNAVAILABLE", reason: (error as Error).message };
    }
  }

  /**
   * Looks up the real listing price + date from NSE's public past-issues
   * catalogue. Used to finish CLOSED -> LISTED with real data once NSE
   * publishes the post-allotment issue price.
   */
  async findListing(companyName: string): Promise<NseListing | null> {
    try {
      const historicalCatalogue = await this.getHistoricalCatalogue();
      return selectNseListing(historicalCatalogue, companyName);
    } catch (error) {
      throw new Error(`NSE historical catalogue unavailable: ${(error as Error).message}`);
    }
  }
}
