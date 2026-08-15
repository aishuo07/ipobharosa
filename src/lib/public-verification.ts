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
  coverageLabel?: string | null;
  providers?: string[];
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
  officialContext?: {
    matchedFields: number;
    materialFields: number;
    providers: string[];
    attempts: { source: string; status: string; reason: string | null }[];
  };
}): PublicVerification | null {
  const checkedAt = input.officialLastAttemptAt?.toISOString() ?? null;
  const nextCheckAt = input.officialNextAttemptAt?.toISOString() ?? null;
  const coverageLabel = input.officialContext?.materialFields
    ? `${input.officialContext.matchedFields}/${input.officialContext.materialFields} core facts matched`
    : null;
  const providers = input.officialContext?.providers ?? [];
  const unavailable = input.officialContext?.attempts.filter((attempt) => attempt.status === "UNAVAILABLE") ?? [];
  const notFound = input.officialContext?.attempts.filter((attempt) => attempt.status === "NOT_FOUND") ?? [];
  if (input.publicationState === "REJECTED") return null;
  const hasCompleteEvidence = Boolean(
    input.officialContext
    && input.officialContext.materialFields > 0
    && input.officialContext.matchedFields >= input.officialContext.materialFields
    && providers.length > 0,
  );
  if (input.publicationState === "PUBLISHED" && hasCompleteEvidence) return {
    state: "VERIFIED",
    label: "Automated verification passed",
    shortLabel: "Verified",
    calendarLabel: "Verified",
    description: "Core IPO terms matched an official exchange source. Source links and checked values are available below.",
    checkedAt,
    nextCheckAt: null,
    issueSummary: null,
    coverageLabel,
    providers,
  };
  if (input.publicationState === "PUBLISHED") return {
    state: "PENDING",
    label: "Published · source evidence incomplete",
    shortLabel: "Evidence incomplete",
    calendarLabel: "Evidence incomplete",
    description: "This IPO page is published, but the current record does not contain enough official field-level evidence to claim automated verification. Treat the terms as provisional while evidence is recovered.",
    checkedAt,
    nextCheckAt,
    issueSummary: null,
    coverageLabel,
    providers,
  };
  if (input.publicationState === "DRAFT") return {
    state: "PENDING",
    label: "Automated verification pending",
    shortLabel: "Pending verification",
    calendarLabel: "Verification pending",
    description: unavailable.length
      ? `${humanList(unavailable.map((attempt) => attempt.source))} was temporarily unavailable. The evidence is retained and an automatic retry is scheduled.`
      : notFound.length
        ? `Final offer terms were not found in ${humanList(notFound.map((attempt) => attempt.source))} during the latest check. The record remains provisional and will be retried.`
        : "These terms were collected from the linked public source but have not completed automated official verification. Values and dates may change.",
    checkedAt,
    nextCheckAt,
    issueSummary: null,
    coverageLabel,
    providers,
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
    coverageLabel,
    providers,
  };
}
