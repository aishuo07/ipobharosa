export type IpoListingCandidate = {
  companyName: string;
  detailUrl: string;
  board: "MAINBOARD" | "SME";
  dateLabel?: string;
  closeDate?: Date;
};

export type IpoFacts = {
  companyName: string;
  board: "MAINBOARD" | "SME";
  priceBandLow: number;
  priceBandHigh: number;
  lotSize: number;
  issueSizeCr: number;
  freshIssueCr: number | null;
  ofsCr: number | null;
  openDate: Date;
  closeDate: Date;
  allotmentDate: Date;
  refundDate: Date;
  listingDate: Date;
  registrar: string;
  leadManagers: string[];
  drhpUrl: string | null;
  rhpUrl: string | null;
};
