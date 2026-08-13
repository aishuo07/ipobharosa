import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { IpoFacts } from "./types";
import { fetchOfficialIpoEvidence } from "./official";
import { decidePublication } from "./official/consensus";
import { officialAutoPublishEnabled, persistOfficialDecision } from "./official/persistence";

const candidateSelect = {
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
  company: { select: { name: true } },
} satisfies Prisma.IpoSelect;

type RevalidationCandidate = Prisma.IpoGetPayload<{ select: typeof candidateSelect }>;

export type RevalidationOutcome = "PUBLISHED" | "ELIGIBLE_HELD" | "RETRY" | "EXCEPTION" | "INVALID" | "EMPTY";

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
  return prisma.ipo.count({ where: { publicationState: { in: ["DRAFT", "QUARANTINED"] } } });
}

/**
 * Revalidates the least-recently-touched unpublished candidate. Every outcome
 * updates the row, so repeated bounded calls naturally rotate through the
 * queue without holding a large ID list in the ingestion checkpoint.
 */
export async function revalidateOldestCandidate(): Promise<RevalidationResult> {
  const candidate = await prisma.ipo.findFirst({
    where: { publicationState: { in: ["DRAFT", "QUARANTINED"] } },
    select: candidateSelect,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
  });
  if (!candidate) return { company: null, outcome: "EMPTY", reasons: [] };

  const facts = candidateAsFacts(candidate);
  if (!facts) {
    const reason = "stored candidate is missing required core facts";
    await prisma.ipo.update({
      where: { id: candidate.id },
      data: { publicationState: "QUARANTINED", quarantineReason: reason },
    });
    return { company: candidate.company.name, outcome: "INVALID", reasons: [reason] };
  }

  const decision = decidePublication(facts, await fetchOfficialIpoEvidence(candidate.company.name));
  const publish = decision.decision === "AUTO_PUBLISH" && officialAutoPublishEnabled();
  const outcome: RevalidationOutcome = decision.decision === "AUTO_PUBLISH"
    ? publish ? "PUBLISHED" : "ELIGIBLE_HELD"
    : decision.decision;

  await prisma.$transaction(async (tx) => {
    await tx.ipo.update({
      where: { id: candidate.id },
      data: {
        publicationState: decision.decision === "EXCEPTION"
          ? "QUARANTINED"
          : publish ? "PUBLISHED" : decision.decision === "AUTO_PUBLISH" ? "DRAFT" : candidate.publicationState,
        autoPublished: publish,
        reviewedAt: publish ? new Date() : candidate.reviewedAt,
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
        note: "all material IPO fields matched captured official evidence",
      },
    });
  });

  return { company: candidate.company.name, outcome, reasons: decision.reasons };
}
