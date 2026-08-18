import type { BoardIpo } from "@/lib/board-data";

export type { BoardIpo };

export type AllotmentStatus = "ALLOTTED" | "NOT_ALLOTTED" | "NOT_APPLIED" | "ERROR";

export type AllotmentResult = {
  pan: string;
  companyName: string;
  registrar: string | null;
  status: AllotmentStatus;
  applied?: string;
  allotted?: string;
  amount?: string;
  applicant?: string;
  error?: string;
  checkedAt: string;
};

export type RegistrarCheck = {
  automatable: boolean;
  portalUrl: string | null;
};

export type RegistrarKind = "mufg" | "kfintech" | "bigshare" | "maashitla" | "manual";
