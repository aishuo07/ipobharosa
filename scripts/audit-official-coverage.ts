import { config as loadEnv } from "dotenv";
loadEnv({ path: process.env.IPOBHAROSA_ENV_FILE ?? ".env.local" });

import type { IpoFacts } from "../src/lib/discovery/types";

function asFacts(candidate: {
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

async function main() {
  const summaryOnly = process.argv.includes("--summary");
  process.env.BSE_OFFICIAL_SOURCE_ENABLED = "true";
  const { prisma } = await import("../src/lib/prisma");
  const { fetchOfficialIpoEvidence } = await import("../src/lib/discovery/official");
  const { decidePublication } = await import("../src/lib/discovery/official/consensus");
  const candidates = await prisma.ipo.findMany({
    where: { publicationState: { in: ["DRAFT", "QUARANTINED"] } },
    select: {
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
      company: { select: { name: true } },
    },
    orderBy: { company: { name: "asc" } },
  });
  const rows = [];
  for (const [index, candidate] of candidates.entries()) {
    console.error(`[audit:no-write] ${index + 1}/${candidates.length} ${candidate.company.name}`);
    const facts = asFacts(candidate);
    if (!facts) {
      rows.push({ company: candidate.company.name, currentState: candidate.publicationState, decision: "INVALID", issueType: null, coverage: null, attempts: [], reasons: ["stored candidate is missing required core facts"], conflicts: [] });
      continue;
    }
    const bundle = await fetchOfficialIpoEvidence(candidate.company.name);
    const decision = decidePublication(facts, bundle);
    rows.push({
      company: candidate.company.name,
      currentState: candidate.publicationState,
      decision: decision.decision,
      issueType: decision.issueType ?? null,
      coverage: decision.coverage ?? null,
      attempts: bundle.attempts,
      reasons: decision.reasons,
      conflicts: decision.comparisons.filter((comparison) => comparison.status === "CONFLICT"),
    });
  }
  const counts = rows.reduce<Record<string, number>>((accumulator, row) => {
    const key = row.issueType && row.issueType !== "IPO" ? `WRONG_TYPE_${row.issueType}` : row.decision;
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
  const output = summaryOnly
    ? {
        mode: "NO_WRITE",
        total: rows.length,
        counts,
        groups: Object.fromEntries(
          Object.entries(
            rows.reduce<Record<string, typeof rows>>((accumulator, row) => {
              const key = row.issueType && row.issueType !== "IPO" ? `WRONG_TYPE_${row.issueType}` : row.decision;
              (accumulator[key] ??= []).push(row);
              return accumulator;
            }, {}),
          ).map(([key, entries]) => [
            key,
            entries.map((row) => ({
              company: row.company,
              currentState: row.currentState,
              issueType: row.issueType,
              reasons: row.reasons,
              conflicts: row.conflicts.map((conflict) => conflict.field),
              attempts: row.attempts.map((attempt) => ({ source: attempt.source, status: attempt.status })),
            })),
          ]),
        ),
      }
    : { mode: "NO_WRITE", total: rows.length, counts, candidates: rows };
  console.log(JSON.stringify(output, null, 2));
  console.error("[audit:no-write] complete; no database writes were performed");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
