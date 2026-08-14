import { getBseJson, type BseRequest } from "./bse-client";
import {
  extractHttpsUrl,
  issuerNamesMatch,
  normalizeIssuerName,
  parseDecimal,
  parseFlexibleIndianDate,
  parseInteger,
  parsePriceBand,
} from "./normalization";
import type {
  OfficialDocument,
  OfficialEvidenceResult,
  OfficialIpoEnrichment,
  OfficialIpoEvidence,
  OfficialIpoSource,
  OfficialIssueType,
} from "./types";

const CURRENT_URL = "https://api.bseindia.com/BseIndiaAPI/api/GetPublicIssue_par_updated/w?flag=1&scrip_Name=&ir_flag=&status=&exchange=";
const HISTORICAL_URL = "https://api.bseindia.com/BseIndiaAPI/api/HomePage_Issues_BBS_Landing_ng/w?flag=2&scrip_Name=&end_dt=&IR_FLAG=&Start_DT=";
const DETAIL_URL = "https://api.bseindia.com/BseIndiaAPI/api/GetMkt_ISSUE_BBS_IPO/w?IPO_NO=";

export type BseCatalogueIssue = {
  Scrip_Name?: string | null;
  Start_Dt?: string | null;
  End_Dt?: string | null;
  Price_Band?: string | null;
  Face_Val?: number | string | null;
  IR_flag?: string | null;
  IR_FLAG_FULL?: string | null;
  eXCHANGE_PLATFORM?: string | null;
  IPO_NO?: number | string | null;
};

export type BseIssueDetail = {
  ScripName?: string | null;
  Security_Type?: string | null;
  Symbol?: string | null;
  Issue_Period?: string | null;
  IPO_Market_Timings?: string | null;
  Cut_off_time_for_UPI_Mandate_Confirmation?: string | null;
  Issue_Size_No_of_shares?: string | number | null;
  Price_Band?: string | null;
  Price_Band_Advertisement?: string | null;
  Face_Value?: string | number | null;
  Market_Lot?: string | number | null;
  Minimum_Bid_Quantity?: string | number | null;
  Maximum_Bid_Quantity_For_Qualified_Institutional_Investors?: string | number | null;
  Maximum_Bid_Quantity_For_Qualified_Non_Institutional_Investors?: string | number | null;
  Book_Running_Lead_Manager?: string | null;
  Co_Book_Running_Lead_Manager?: string | null;
  Registrar?: string | null;
  Sponsor_Bank?: string | null;
  Prospectus_GID?: string | null;
  Addendum?: string | null;
  Corrigendum?: string | null;
  Anchor_Details?: string | null;
  DT_TM?: string | null;
};

type BseCatalogueResponse = { Table?: BseCatalogueIssue[] };
type BseDetailResponse = {
  IPONO_0?: BseIssueDetail[];
  IPONO_4?: Array<{ SUBJECT?: string | null; FILENAME?: string | null }>;
};

function issueType(row: BseCatalogueIssue): OfficialIssueType {
  const value = `${row.IR_flag ?? ""} ${row.IR_FLAG_FULL ?? ""}`.toUpperCase();
  if (/\bFPO\b|FOLLOW.ON/.test(value)) return "FPO";
  if (/INVIT|INFRASTRUCTURE INVESTMENT TRUST/.test(value)) return "INVIT";
  if (/RIGHT/.test(value)) return "RIGHTS";
  if (/BUYBACK|BUY BACK/.test(value)) return "BUYBACK";
  if (/\bIPO\b|BOOK BUILDING/.test(value)) return "IPO";
  return "OTHER";
}

export function selectBseIssue(rows: BseCatalogueIssue[], companyName: string): BseCatalogueIssue | null {
  const named = rows.filter((row): row is BseCatalogueIssue & { Scrip_Name: string } => Boolean(row.Scrip_Name));
  const target = normalizeIssuerName(companyName);
  const exact = named.filter((row) => normalizeIssuerName(row.Scrip_Name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const compatible = named.filter((row) => issuerNamesMatch(row.Scrip_Name, companyName));
  return compatible.length === 1 ? compatible[0] : null;
}

function firstRecordName(value: string): string {
  return value.split("^")[0].trim();
}

function splitRecords(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split("#").map(firstRecordName).filter(Boolean);
}

function addDocument(documents: OfficialDocument[], label: string, value: string | null | undefined, kind: OfficialDocument["kind"]): void {
  const url = extractHttpsUrl(value);
  if (url && !documents.some((document) => document.url === url)) documents.push({ label, url, kind });
}

export function parseBseDetail(
  issue: BseCatalogueIssue,
  response: BseDetailResponse,
  capturedAt = new Date(),
): OfficialIpoEvidence {
  const detail = response.IPONO_0?.[0];
  if (!detail) throw new Error("BSE issue detail is empty");
  const ipoNo = String(issue.IPO_NO ?? "");
  const sourceUrl = `${DETAIL_URL}${encodeURIComponent(ipoNo)}`;
  const period = detail.Issue_Period?.split(/\s+to\s+/i) ?? [];
  const price = parsePriceBand(detail.Price_Band?.split("|")[0] ?? issue.Price_Band);
  const boardText = issue.eXCHANGE_PLATFORM?.toUpperCase() ?? "";
  const rhpUrl = extractHttpsUrl(detail.Prospectus_GID);
  const facts = {
    companyName: detail.ScripName?.trim() || issue.Scrip_Name?.trim() || null,
    board: boardText.includes("SME") ? "SME" as const : boardText.includes("MAIN") ? "MAINBOARD" as const : null,
    priceBandLow: price?.low ?? null,
    priceBandHigh: price?.high ?? null,
    lotSize: parseInteger(detail.Minimum_Bid_Quantity ?? detail.Market_Lot),
    openDate: period[0] ? parseFlexibleIndianDate(period[0]) : issue.Start_Dt ? new Date(issue.Start_Dt) : null,
    closeDate: period[1] ? parseFlexibleIndianDate(period[1]) : issue.End_Dt ? new Date(issue.End_Dt) : null,
    registrar: detail.Registrar ? firstRecordName(detail.Registrar) : null,
    leadManagers: [...splitRecords(detail.Book_Running_Lead_Manager), ...splitRecords(detail.Co_Book_Running_Lead_Manager)],
    rhpUrl,
  };
  const documents: OfficialDocument[] = [];
  addDocument(documents, "Official prospectus / RHP", detail.Prospectus_GID, "PROSPECTUS");
  addDocument(documents, "Price band advertisement", detail.Price_Band_Advertisement, "PRICE_BAND");
  addDocument(documents, "Addendum", detail.Addendum, "CORRIGENDUM");
  addDocument(documents, "Corrigendum", detail.Corrigendum, "CORRIGENDUM");
  addDocument(documents, "Anchor allocation", detail.Anchor_Details, "ANCHOR");
  for (const notice of response.IPONO_4 ?? []) addDocument(documents, notice.SUBJECT?.trim() || "BSE notice", notice.FILENAME, "NOTICE");
  const enrichment: OfficialIpoEnrichment = {
    issueType: issueType(issue),
    symbol: detail.Symbol?.trim() || null,
    faceValue: parseDecimal(detail.Face_Value ?? issue.Face_Val),
    issueSizeShares: parseInteger(detail.Issue_Size_No_of_shares),
    marketLot: parseInteger(detail.Market_Lot),
    minimumBidQuantity: parseInteger(detail.Minimum_Bid_Quantity),
    maximumRetailAmount: null,
    maximumEmployeeAmount: null,
    maximumQibQuantity: parseInteger(detail.Maximum_Bid_Quantity_For_Qualified_Institutional_Investors),
    maximumNiiQuantity: parseInteger(detail.Maximum_Bid_Quantity_For_Qualified_Non_Institutional_Investors),
    employeeDiscount: detail.Price_Band?.match(/Employee Discount[^|]*/i)?.[0] ?? null,
    issueSizeDescription: detail.Issue_Size_No_of_shares ? `${detail.Issue_Size_No_of_shares} shares` : null,
    marketTimings: detail.IPO_Market_Timings?.trim() || null,
    upiMandateCutoff: detail.Cut_off_time_for_UPI_Mandate_Confirmation?.trim() || null,
    sponsorBanks: splitRecords(detail.Sponsor_Bank),
    documents,
    demand: null,
  };
  const fieldSources = Object.fromEntries(
    Object.entries(facts)
      .filter(([, value]) => value !== null && (!Array.isArray(value) || value.length > 0))
      .map(([field]) => [field, field === "rhpUrl" && rhpUrl ? rhpUrl : sourceUrl]),
  );
  return { source: "BSE", sourceUrl, capturedAt, facts, enrichment, fieldSources, raw: { issue, response } };
}

export class BseOfficialSource implements OfficialIpoSource {
  readonly source = "BSE" as const;
  private cataloguePromise: Promise<BseCatalogueIssue[]> | null = null;
  private catalogueExpiresAt = 0;

  constructor(private readonly request?: BseRequest) {}

  private getJson<T>(url: string): Promise<T> {
    return getBseJson<T>(url, this.request);
  }

  private getCatalogue(): Promise<BseCatalogueIssue[]> {
    if (!this.cataloguePromise || Date.now() >= this.catalogueExpiresAt) {
      this.cataloguePromise = Promise.all([
        this.getJson<BseCatalogueResponse>(CURRENT_URL),
        this.getJson<BseCatalogueResponse>(HISTORICAL_URL),
      ]).then(([current, historical]) => {
        const byId = new Map<string, BseCatalogueIssue>();
        for (const row of [...(current.Table ?? []), ...(historical.Table ?? [])]) {
          if (row.IPO_NO !== null && row.IPO_NO !== undefined) byId.set(String(row.IPO_NO), row);
        }
        return [...byId.values()];
      });
      this.catalogueExpiresAt = Date.now() + 60_000;
    }
    return this.cataloguePromise;
  }

  async findEvidence(companyName: string): Promise<OfficialEvidenceResult> {
    let rows: BseCatalogueIssue[];
    try {
      rows = await this.getCatalogue();
    } catch (error) {
      return { status: "UNAVAILABLE", reason: `BSE catalogue unavailable: ${(error as Error).message}` };
    }
    const issue = selectBseIssue(rows, companyName);
    if (!issue?.IPO_NO) return { status: "NOT_FOUND", reason: `${companyName} is not present in BSE's current or historical public-issue catalogues` };
    const type = issueType(issue);
    const sourceUrl = `${DETAIL_URL}${encodeURIComponent(String(issue.IPO_NO))}`;
    if (type !== "IPO") return { status: "WRONG_ISSUE_TYPE", reason: `BSE classifies ${companyName} as ${type}, not IPO`, issueType: type, sourceUrl };
    try {
      const response = await this.getJson<BseDetailResponse>(sourceUrl);
      return { status: "FOUND", evidence: parseBseDetail(issue, response) };
    } catch (error) {
      return { status: "UNAVAILABLE", reason: `BSE issue detail unavailable: ${(error as Error).message}` };
    }
  }
}
