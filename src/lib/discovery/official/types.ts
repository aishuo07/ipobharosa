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
  source: "NSE" | "SEBI";
  sourceUrl: string;
  capturedAt: Date;
  facts: OfficialIpoFacts;
  fieldSources: Partial<Record<MaterialOfficialField, string>>;
  raw: unknown;
};

export type OfficialEvidenceResult =
  | { status: "FOUND"; evidence: OfficialIpoEvidence }
  | { status: "NOT_FOUND"; reason: string }
  | { status: "UNAVAILABLE"; reason: string };

export type FieldComparison = {
  field: MaterialOfficialField;
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
};

export interface OfficialIpoSource {
  readonly source: OfficialIpoEvidence["source"];
  findEvidence(companyName: string): Promise<OfficialEvidenceResult>;
}

