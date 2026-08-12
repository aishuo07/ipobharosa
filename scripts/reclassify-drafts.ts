import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.IPOBHAROSA_ENV_FILE ?? ".env.local" });

import type { IpoFacts } from "../src/lib/discovery/types";

function asFacts(draft: {
  company: { name: string };
  board: "MAINBOARD" | "SME";
  priceBandLow: { toNumber(): number } | null;
  priceBandHigh: { toNumber(): number } | null;
  lotSize: number | null;
  issueSizeCr: { toNumber(): number } | null;
  freshIssueCr: { toNumber(): number } | null;
  ofsCr: { toNumber(): number } | null;
  openDate: Date | null;
  closeDate: Date | null;
  allotmentDate: Date | null;
  refundDate: Date | null;
  listingDate: Date | null;
  registrar: string | null;
  leadManagers: string[];
  drhpUrl: string | null;
  rhpUrl: string | null;
}): IpoFacts | null {
  if (!draft.priceBandLow || !draft.priceBandHigh || !draft.lotSize || !draft.issueSizeCr || !draft.openDate || !draft.closeDate ||
      !draft.allotmentDate || !draft.refundDate || !draft.listingDate || !draft.registrar) return null;
  return {
    companyName: draft.company.name,
    board: draft.board,
    priceBandLow: draft.priceBandLow.toNumber(),
    priceBandHigh: draft.priceBandHigh.toNumber(),
    lotSize: draft.lotSize,
    issueSizeCr: draft.issueSizeCr.toNumber(),
    freshIssueCr: draft.freshIssueCr?.toNumber() ?? null,
    ofsCr: draft.ofsCr?.toNumber() ?? null,
    openDate: draft.openDate,
    closeDate: draft.closeDate,
    allotmentDate: draft.allotmentDate,
    refundDate: draft.refundDate,
    listingDate: draft.listingDate,
    registrar: draft.registrar,
    leadManagers: draft.leadManagers,
    drhpUrl: draft.drhpUrl,
    rhpUrl: draft.rhpUrl,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/prisma");
  const { fetchOfficialIpoEvidence } = await import("../src/lib/discovery/official");
  const { decidePublication } = await import("../src/lib/discovery/official/consensus");
  const { persistOfficialDecision } = await import("../src/lib/discovery/official/persistence");

  console.error("[dry-run] loading unpublished candidates");
  const drafts = await prisma.ipo.findMany({
    where: { publicationState: { in: ["DRAFT", "QUARANTINED"] } },
    select: {
      id: true,
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
      company: { select: { name: true } },
    },
    orderBy: { discoveredAt: "desc" },
  });
  console.error(`[dry-run] loaded ${drafts.length} candidate(s); loading NSE catalogue`);
  const report: Array<{ company: string; decision: string; reasons: string[] }> = [];

  for (const [index, draft] of drafts.entries()) {
    console.error(`[dry-run] ${index + 1}/${drafts.length} ${draft.company.name}`);
    const facts = asFacts(draft);
    if (!facts) {
      report.push({ company: draft.company.name, decision: "EXCEPTION", reasons: ["stored candidate is missing required core facts"] });
      continue;
    }
    const official = await fetchOfficialIpoEvidence(draft.company.name);
    const decision = decidePublication(facts, official);
    report.push({ company: draft.company.name, decision: decision.decision, reasons: decision.reasons });

    if (!apply) continue;
    await prisma.$transaction(async (tx) => {
      await tx.ipo.update({
        where: { id: draft.id },
        data: {
          officialDecision: decision.decision,
          publicationState: decision.decision === "AUTO_PUBLISH" ? "PUBLISHED" : decision.decision === "EXCEPTION" ? "QUARANTINED" : "DRAFT",
          autoPublished: decision.decision === "AUTO_PUBLISH",
          reviewedAt: decision.decision === "AUTO_PUBLISH" ? new Date() : draft.reviewedAt,
          quarantineReason: decision.decision === "EXCEPTION" ? decision.reasons.join("; ") : null,
          ...(decision.evidence ? {
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
      await persistOfficialDecision(tx, draft.id, decision);
      if (decision.decision === "AUTO_PUBLISH") {
        await tx.correctionLog.create({
          data: {
            entityType: "Ipo",
            entityId: draft.id,
            action: "auto-publish",
            performedBy: "official-revalidation",
            note: "all material IPO fields matched captured NSE evidence",
          },
        });
      }
    });
  }

  const counts = report.reduce<Record<string, number>>((acc, row) => {
    acc[row.decision] = (acc[row.decision] ?? 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", total: report.length, counts, candidates: report }, null, 2));
  if (!apply) console.log("\nNo database writes were performed. --apply is a separate explicit operation.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
