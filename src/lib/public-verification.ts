export const PUBLIC_VERIFICATION_STATES = ["VERIFIED", "PENDING", "NEEDS_REVIEW"] as const;

export type PublicVerificationState = (typeof PUBLIC_VERIFICATION_STATES)[number];
export type PublicationState = "PUBLISHED" | "DRAFT" | "QUARANTINED" | "REJECTED";

export type PublicVerification = {
  state: PublicVerificationState;
  label: string;
  shortLabel: string;
  description: string;
  calendarLabel: string;
  checkedAt: string | null;
  nextCheckAt: string | null;
  issueSummary: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  priceBandLow: "price band",
  priceBandHigh: "price band",
  lotSize: "lot size",
  issueSizeCr: "issue size",
  freshIssueCr: "fresh issue",
  ofsCr: "offer for sale",
  openDate: "open date",
  closeDate: "close date",
  allotmentDate: "allotment date",
  refundDate: "refund date",
  listingDate: "listing date",
  registrar: "registrar",
  leadManagers: "lead managers",
  rhpUrl: "RHP",
};

function humanList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "Some values";
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

export function safeIssueSummary(reason: string | null): string | null {
  if (!reason) return null;
  const fields = [...new Set(reason.split(";").flatMap((part) => {
    const field = part.trim().match(/^([A-Za-z][A-Za-z0-9]*)\s+(?:differs|is missing)/)?.[1];
    return field ? [FIELD_LABELS[field] ?? field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()] : [];
  }))];
  return fields.length ? `${humanList(fields).replace(/^./, (letter) => letter.toUpperCase())} differ across sources.` : "Official sources need manual review.";
}

export function publicVerificationFromPublicationState(input: {
  publicationState: PublicationState;
  officialLastAttemptAt: Date | null;
  officialNextAttemptAt: Date | null;
  quarantineReason: string | null;
}): PublicVerification | null {
  const checkedAt = input.officialLastAttemptAt?.toISOString() ?? null;
  const nextCheckAt = input.officialNextAttemptAt?.toISOString() ?? null;
  if (input.publicationState === "REJECTED") return null;
  if (input.publicationState === "PUBLISHED") return {
    state: "VERIFIED",
    label: "Automated verification passed",
    shortLabel: "Verified",
    calendarLabel: "Verified",
    description: "Core IPO terms matched an official exchange source. Source links and checked values are available below.",
    checkedAt,
    nextCheckAt: null,
    issueSummary: null,
  };
  if (input.publicationState === "DRAFT") return {
    state: "PENDING",
    label: "Automated verification pending",
    shortLabel: "Pending verification",
    calendarLabel: "Verification pending",
    description: "These terms were collected from the linked public source but have not completed automated official verification. Values and dates may change.",
    checkedAt,
    nextCheckAt,
    issueSummary: null,
  };
  return {
    state: "NEEDS_REVIEW",
    label: "Source mismatch needs review",
    shortLabel: "Needs review",
    calendarLabel: "Needs review",
    description: "Automated checks found a mismatch between sources. Treat these values as provisional until the discrepancy is resolved.",
    checkedAt,
    nextCheckAt,
    issueSummary: safeIssueSummary(input.quarantineReason),
  };
}
