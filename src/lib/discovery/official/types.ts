import type { IpoBoard } from "@/generated/prisma/enums";

export const MATERIAL_OFFICIAL_FIELDS = [
  "companyName",
  "board",
  "priceBandLow",
  "priceBandHigh",
  "lotSize",
  "openDate",
  "closeDate",
  "registrar",
  "leadManagers",
  "rhpUrl",
] as const;

export type MaterialOfficialField = (typeof MATERIAL_OFFICIAL_FIELDS)[number];

export type OfficialSourceName = "NSE" | "BSE" | "SEBI";
export type OfficialIssueType = "IPO" | "FPO" | "INVIT" | "RIGHTS" | "BUYBACK" | "OTHER";

export type OfficialDocument = {
  label: string;
  url: string;
  kind: "RHP" | "PROSPECTUS" | "PRICE_BAND" | "CORRIGENDUM" | "ANCHOR" | "NOTICE" | "OTHER";
};

export type OfficialDemandSnapshot = {
  qibX: number | null;
  niiX: number | null;
  retailX: number | null;
  employeeX: number | null;
  totalX: number | null;
  capturedAt: Date;
  sourceUrl: string;
};

export type OfficialIpoEnrichment = {
  issueType: OfficialIssueType;
  symbol: string | null;
  faceValue: number | null;
  issueSizeShares: number | null;
  marketLot: number | null;
  minimumBidQuantity: number | null;
  maximumRetailAmount: number | null;
  maximumEmployeeAmount: number | null;
  maximumQibQuantity: number | null;
  maximumNiiQuantity: number | null;
  employeeDiscount: string | null;
  issueSizeDescription: string | null;
  marketTimings: string | null;
  upiMandateCutoff: string | null;
  sponsorBanks: string[];
  documents: OfficialDocument[];
  demand: OfficialDemandSnapshot | null;
};

export type OfficialIpoFacts = {
  companyName: string | null;
  board: IpoBoard | null;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  lotSize: number | null;
  openDate: Date | null;
  closeDate: Date | null;
  registrar: string | null;
  leadManagers: string[];
  rhpUrl: string | null;
};

export type OfficialIpoEvidence = {
  source: OfficialSourceName;
  sourceUrl: string;
  capturedAt: Date;
  facts: OfficialIpoFacts;
  enrichment?: OfficialIpoEnrichment;
  fieldSources: Partial<Record<MaterialOfficialField, string>>;
  raw: unknown;
};

export type OfficialEvidenceResult =
  | { status: "FOUND"; evidence: OfficialIpoEvidence }
  | { status: "NOT_FOUND"; reason: string }
  | { status: "UNAVAILABLE"; reason: string }
  | { status: "WRONG_ISSUE_TYPE"; reason: string; issueType: OfficialIssueType; sourceUrl: string | null };

export type OfficialEvidenceAttempt = {
  source: OfficialSourceName;
  status: OfficialEvidenceResult["status"];
  reason: string | null;
  issueType: OfficialIssueType | null;
  sourceUrl: string | null;
};

export type OfficialEvidenceBundle = {
  evidence: OfficialIpoEvidence[];
  attempts: OfficialEvidenceAttempt[];
};

export type FieldComparison = {
  field: MaterialOfficialField;
  source?: OfficialSourceName;
  status: "MATCH" | "CONFLICT" | "MISSING_OFFICIAL";
  candidateValue: string | number | string[] | null;
  officialValue: string | number | string[] | null;
  sourceUrl: string | null;
};

export type PublicationDecision = {
  decision: "AUTO_PUBLISH" | "RETRY" | "EXCEPTION";
  reasons: string[];
  comparisons: FieldComparison[];
  evidence: OfficialIpoEvidence | null;
  evidences?: OfficialIpoEvidence[];
  attempts?: OfficialEvidenceAttempt[];
  issueType?: OfficialIssueType | null;
  coverage?: {
    matchedFields: number;
    materialFields: number;
    providersChecked: OfficialSourceName[];
    providersFound: OfficialSourceName[];
  };
};

export interface OfficialIpoSource {
  readonly source: OfficialIpoEvidence["source"];
  findEvidence(companyName: string): Promise<OfficialEvidenceResult>;
}
