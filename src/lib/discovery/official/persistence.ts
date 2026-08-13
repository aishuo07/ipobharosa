import type { Prisma } from "@/generated/prisma/client";
import type { PublicationDecision } from "./types";

function serialized(value: string | number | string[] | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

export async function persistOfficialDecision(
  tx: Prisma.TransactionClient,
  ipoId: string,
  decision: PublicationDecision,
): Promise<void> {
  if (!decision.evidence) return;
  await tx.officialEvidenceCapture.create({
    data: {
      ipoId,
      source: decision.evidence.source,
      sourceUrl: decision.evidence.sourceUrl,
      capturedAt: decision.evidence.capturedAt,
      decision: decision.decision,
      reasons: decision.reasons,
      raw: decision.evidence.raw as Prisma.InputJsonValue,
      comparisons: {
        create: decision.comparisons.map((comparison) => ({
          field: comparison.field,
          status: comparison.status,
          candidateValue: serialized(comparison.candidateValue),
          officialValue: serialized(comparison.officialValue),
          sourceUrl: comparison.sourceUrl,
        })),
      },
    },
  });
}

export function officialAutoPublishEnabled(): boolean {
  return process.env.OFFICIAL_IPO_AUTO_PUBLISH_ENABLED === "true";
}

