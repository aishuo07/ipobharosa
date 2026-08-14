import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { IpoFacts } from "./types";
import { fetchOfficialIpoEvidence } from "./official";
import { decidePublication } from "./official/consensus";
import { hasOfficialEvidence, recordOfficialEvidenceHealth } from "./official/health";
import { officialAutoPublishEnabled, persistOfficialDecision, persistOfficialIncident } from "./official/persistence";

export const candidateSelect = {
  id: true,
  publicationState: true,
  board: true,
  priceBandLow: true,
  priceBandHigh: true,
  lotSize: true,
  issueSizeCr: true,
  freshIssueCr: true,
  ofsCr: true,
  openDate: true,
  closeDate: true,
  allotmentDate: true,
  refundDate: true,
  listingDate: true,
  registrar: true,
  leadManagers: true,
  drhpUrl: true,
  rhpUrl: true,
  reviewedAt: true,
  quarantineReason: true,
  officialCheckAttempts: true,
  officialNextAttemptAt: true,
  company: { select: { name: true } },
} satisfies Prisma.IpoSelect;

export type RevalidationCandidate = Prisma.IpoGetPayload<{ select: typeof candidateSelect }>;

export type RevalidationOutcome = "PUBLISHED" | "ELIGIBLE_HELD" | "RETRY" | "EXCEPTION" | "WRONG_TYPE" | "INVALID" | "EMPTY";

export type RevalidationResult = {
  company: string | null;
  outcome: RevalidationOutcome;
  reasons: string[];
};

export function candidateAsFacts(candidate: RevalidationCandidate): IpoFacts | null {
  if (!candidate.priceBandLow || !candidate.priceBandHigh || !candidate.lotSize || !candidate.issueSizeCr ||
      !candidate.openDate || !candidate.closeDate || !candidate.allotmentDate || !candidate.refundDate ||
      !candidate.listingDate || !candidate.registrar) return null;
  return {
    companyName: candidate.company.name,
    board: candidate.board,
    priceBandLow: candidate.priceBandLow.toNumber(),
    priceBandHigh: candidate.priceBandHigh.toNumber(),
    lotSize: candidate.lotSize,
    issueSizeCr: candidate.issueSizeCr.toNumber(),
    freshIssueCr: candidate.freshIssueCr?.toNumber() ?? null,
    ofsCr: candidate.ofsCr?.toNumber() ?? null,
    openDate: candidate.openDate,
    closeDate: candidate.closeDate,
    allotmentDate: candidate.allotmentDate,
    refundDate: candidate.refundDate,
    listingDate: candidate.listingDate,
    registrar: candidate.registrar,
    leadManagers: candidate.leadManagers,
    drhpUrl: candidate.drhpUrl,
    rhpUrl: candidate.rhpUrl,
  };
}

export async function countRevalidationCandidates(): Promise<number> {
  const now = new Date();
  return prisma.ipo.count({ where: {
    publicationState: { in: ["DRAFT", "QUARANTINED"] },
    OR: [{ officialNextAttemptAt: null }, { officialNextAttemptAt: { lte: now } }],
  } });
}

export function nextOfficialRetryAt(attempts: number, now = new Date()): Date {
  const delayMs = Math.min(24, 2 ** Math.max(1, attempts)) * 60 * 60 * 1_000;
  return new Date(now.getTime() + delayMs);
}

export function nextOfficialConflictCheckAt(now = new Date()): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1_000);
}

async function revalidateCandidate(candidate: RevalidationCandidate): Promise<RevalidationResult> {
  const now = new Date();
  const facts = candidateAsFacts(candidate);
  if (!facts) {
    const reason = "stored candidate is missing required core facts";
    await prisma.ipo.update({
      where: { id: candidate.id },
      data: {
        publicationState: "QUARANTINED",
        quarantineReason: reason,
        officialLastAttemptAt: now,
        officialNextAttemptAt: nextOfficialConflictCheckAt(now),
      },
    });
    return { company: candidate.company.name, outcome: "INVALID", reasons: [reason] };
  }

  const officialResult = await fetchOfficialIpoEvidence(candidate.company.name);
  await recordOfficialEvidenceHealth(officialResult, now);
  const decision = decidePublication(facts, officialResult);
  const wrongIssueType = decision.issueType !== null && decision.issueType !== undefined && decision.issueType !== "IPO";
  const publish = !wrongIssueType && decision.decision === "AUTO_PUBLISH" && officialAutoPublishEnabled();
  const outcome: RevalidationOutcome = wrongIssueType ? "WRONG_TYPE" : decision.decision === "AUTO_PUBLISH"
    ? publish ? "PUBLISHED" : "ELIGIBLE_HELD"
    : decision.decision;

  await prisma.$transaction(async (tx) => {
    await tx.ipo.update({
      where: { id: candidate.id },
      data: {
        publicationState: wrongIssueType
          ? "REJECTED"
          : decision.decision === "EXCEPTION"
          ? "QUARANTINED"
          : publish ? "PUBLISHED" : decision.decision === "AUTO_PUBLISH" ? "DRAFT" : candidate.publicationState,
        autoPublished: publish,
        reviewedAt: publish ? now : candidate.reviewedAt,
        officialLastAttemptAt: now,
        officialLastSuccessAt: hasOfficialEvidence(officialResult) ? now : undefined,
        officialIssueType: decision.issueType ?? undefined,
        officialCheckAttempts: decision.decision === "RETRY" ? candidate.officialCheckAttempts + 1 : 0,
        officialNextAttemptAt: decision.decision === "RETRY"
          ? nextOfficialRetryAt(candidate.officialCheckAttempts + 1, now)
          : decision.decision === "EXCEPTION" ? nextOfficialConflictCheckAt(now) : null,
        quarantineReason: decision.decision === "EXCEPTION"
          ? decision.reasons.join("; ")
          : decision.decision === "RETRY" ? candidate.quarantineReason : null,
        ...(publish && decision.evidence ? {
          board: decision.evidence.facts.board!,
          priceBandLow: decision.evidence.facts.priceBandLow!,
          priceBandHigh: decision.evidence.facts.priceBandHigh!,
          lotSize: decision.evidence.facts.lotSize!,
          openDate: decision.evidence.facts.openDate!,
          closeDate: decision.evidence.facts.closeDate!,
          registrar: decision.evidence.facts.registrar!,
          leadManagers: decision.evidence.facts.leadManagers,
          rhpUrl: decision.evidence.facts.rhpUrl!,
        } : {}),
      },
    });
    await persistOfficialDecision(tx, candidate.id, decision);
    if (decision.decision === "EXCEPTION" && decision.evidence) {
      await persistOfficialIncident(tx, candidate.id, "CONFLICT", decision);
    }
    if (!publish || !decision.evidence) return;

    const documentUrl = decision.evidence.facts.rhpUrl!;
    const existingDocument = await tx.document.findFirst({ where: { ipoId: candidate.id, url: documentUrl } });
    if (!existingDocument) {
      await tx.document.create({
        data: {
          ipoId: candidate.id,
          label: /(?:^|[/_])prospectus(?:[_.]|$)/i.test(documentUrl) ? "Official Prospectus" : "Red Herring Prospectus (RHP)",
          url: documentUrl,
          docType: "rhp",
        },
      });
    }
    await tx.correctionLog.create({
      data: {
        entityType: "Ipo",
        entityId: candidate.id,
        action: "auto-publish",
        performedBy: "official-revalidation",
        note: `all material IPO fields matched captured official evidence from ${(decision.coverage?.providersFound ?? [decision.evidence.source]).join(" + ")}`,
      },
    });
  });

  return { company: candidate.company.name, outcome, reasons: decision.reasons };
}

export async function revalidateCandidateById(id: string): Promise<RevalidationResult> {
  const candidate = await prisma.ipo.findFirst({
    where: { id, publicationState: { in: ["DRAFT", "QUARANTINED"] } },
    select: candidateSelect,
  });
  if (!candidate) return { company: null, outcome: "EMPTY", reasons: [] };
  return revalidateCandidate(candidate);
}

/**
 * Revalidates the least-recently-touched unpublished candidate. Every outcome
 * updates the row, so repeated bounded calls naturally rotate through the
 * queue without holding a large ID list in the ingestion checkpoint.
 */
export async function revalidateOldestCandidate(): Promise<RevalidationResult> {
  const now = new Date();
  const candidate = await prisma.ipo.findFirst({
    where: {
      publicationState: { in: ["DRAFT", "QUARANTINED"] },
      OR: [{ officialNextAttemptAt: null }, { officialNextAttemptAt: { lte: now } }],
    },
    select: candidateSelect,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
  });
  if (!candidate) return { company: null, outcome: "EMPTY", reasons: [] };
  return revalidateCandidate(candidate);
}
