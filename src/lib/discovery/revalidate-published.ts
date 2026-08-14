import { prisma } from "@/lib/prisma";
import { fetchOfficialIpoEvidence } from "./official";
import { decidePublication } from "./official/consensus";
import type { PublicationDecision } from "./official/types";
import { persistOfficialDecision, persistOfficialIncident } from "./official/persistence";
import { candidateAsFacts, candidateSelect, nextOfficialRetryAt } from "./revalidate";
import { recordSourceFailure, recordSourceSuccess } from "@/lib/ingestion/source-operation";

export type PublishedRevalidationOutcome = "MATCHED" | "DRIFT" | "RETRY" | "INVALID" | "EMPTY";

export type PublishedRevalidationResult = {
  company: string | null;
  outcome: PublishedRevalidationOutcome;
  reasons: string[];
  newIncident?: boolean;
};

export function publishedOutcome(decision: PublicationDecision): PublishedRevalidationOutcome {
  if (decision.decision === "AUTO_PUBLISH") return "MATCHED";
  if (decision.decision === "EXCEPTION") return "DRIFT";
  return "RETRY";
}

function duePublishedWhere(now: Date) {
  return {
    publicationState: "PUBLISHED" as const,
    OR: [{ officialNextAttemptAt: null }, { officialNextAttemptAt: { lte: now } }],
  };
}

export async function countPublishedRevalidationCandidates(): Promise<number> {
  return prisma.ipo.count({ where: duePublishedWhere(new Date()) });
}

export async function revalidateOldestPublished(): Promise<PublishedRevalidationResult> {
  const now = new Date();
  const candidate = await prisma.ipo.findFirst({
    where: duePublishedWhere(now),
    select: candidateSelect,
    orderBy: [{ officialLastSuccessAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
  });
  if (!candidate) return { company: null, outcome: "EMPTY", reasons: [] };

  const facts = candidateAsFacts(candidate);
  if (!facts) {
    await prisma.ipo.update({
      where: { id: candidate.id },
      data: {
        officialLastAttemptAt: now,
        officialCheckAttempts: candidate.officialCheckAttempts + 1,
        officialNextAttemptAt: nextOfficialRetryAt(candidate.officialCheckAttempts + 1, now),
      },
    });
    return { company: candidate.company.name, outcome: "INVALID", reasons: ["published IPO is missing required core facts"] };
  }

  const officialResult = await fetchOfficialIpoEvidence(candidate.company.name);
  if (officialResult.status === "UNAVAILABLE") {
    await recordSourceFailure("nse:ipo-evidence", "NSE", "ipo-evidence", officialResult.reason, now);
  } else {
    await recordSourceSuccess("nse:ipo-evidence", "NSE", "ipo-evidence", now);
  }
  const decision = decidePublication(facts, officialResult);
  const outcome = publishedOutcome(decision);

  const incident = await prisma.$transaction(async (tx) => {
    await tx.ipo.update({
      where: { id: candidate.id },
      data: {
        officialLastAttemptAt: now,
        officialLastSuccessAt: officialResult.status === "FOUND" ? now : undefined,
        officialCheckAttempts: outcome === "RETRY" ? candidate.officialCheckAttempts + 1 : 0,
        officialNextAttemptAt: outcome === "RETRY"
          ? nextOfficialRetryAt(candidate.officialCheckAttempts + 1, now)
          : null,
      },
    });
    await persistOfficialDecision(tx, candidate.id, decision);
    return outcome === "DRIFT"
      ? persistOfficialIncident(tx, candidate.id, "PUBLISHED_DRIFT", decision)
      : null;
  });

  return { company: candidate.company.name, outcome, reasons: decision.reasons, newIncident: incident?.occurrenceCount === 1 };
}
