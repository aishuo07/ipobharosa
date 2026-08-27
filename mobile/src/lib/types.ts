export type IpoStatus = "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
export type IpoBoard = "MAINBOARD" | "SME";
export type PublicVerificationState = "VERIFIED" | "PENDING" | "UNVERIFIED";

export type BoardIpo = {
  id: string;
  slug: string;
  companyName: string;
  sector: string;
  status: IpoStatus;
  board: IpoBoard;
  verification: {
    state: PublicVerificationState;
    label: string;
  };
  priceBandLow: number;
  priceBandHigh: number;
  lotSize: number;
  issueSizeCr: number;
  freshIssueCr: number | null;
  ofsCr: number | null;
  openDate: string;
  closeDate: string;
  allotmentDate: string;
  refundDate: string;
  listingDate: string;
  listingPrice: number | null;
  registrar: string | null;
  leadManagers: string[];
  gmp: {
    medianValue: number;
    sourceCount: number;
    maxDeviation: number;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    capturedAt: string;
  } | null;
  subscription: {
    qibX: number | null;
    niiX: number | null;
    retailX: number | null;
    employeeX: number | null;
    totalX?: number | null;
    capturedAt: string;
    sourceName?: string;
    sourceUrl?: string;
  } | null;
  gmpHistory: { value: number; capturedAt: string }[];
  gmpAvailability?: {
    state: "AVAILABLE" | "NOT_YET" | "NOT_COVERED" | "SOURCE_FAILURE";
    reason: string;
  };
  documents: { label: string; url: string; docType: string }[];
  provenance: {
    discovery: { name: string; url: string; note: string }[];
    gmp: { name: string; url: string; note: string }[];
    subscription: { name: string; url: string; note: string } | null;
  };
};

export type BoardFilter = "ALL" | "MAINBOARD" | "SME";

export function isBoardIpo(value: unknown): value is BoardIpo {
  if (!value || typeof value !== "object") return false;
  const ipo = value as Record<string, unknown>;
  return typeof ipo.companyName === "string" && typeof ipo.board === "string";
}

export function isBoardIpoArray(value: unknown): value is BoardIpo[] {
  return Array.isArray(value) && value.every(isBoardIpo);
}