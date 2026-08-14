import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { OfficialIncidentKind } from "@/generated/prisma/enums";
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

export function officialIncidentFingerprint(
  ipoId: string,
  kind: OfficialIncidentKind,
  decision: PublicationDecision,
): string {
  const conflictShape = decision.comparisons
    .filter((comparison) => comparison.status === "CONFLICT")
    .map((comparison) => ({
      field: comparison.field,
      candidateValue: serialized(comparison.candidateValue),
      officialValue: serialized(comparison.officialValue),
      sourceUrl: comparison.sourceUrl,
    }))
    .sort((left, right) => left.field.localeCompare(right.field));
  return createHash("sha256")
    .update(JSON.stringify({ ipoId, kind, source: decision.evidence?.source, conflictShape }))
    .digest("hex");
}

export async function persistOfficialIncident(
  tx: Prisma.TransactionClient,
  ipoId: string,
  kind: OfficialIncidentKind,
  decision: PublicationDecision,
): Promise<{ occurrenceCount: number } | null> {
  if (!decision.evidence) return null;
  const conflicts = decision.comparisons.filter((comparison) => comparison.status === "CONFLICT");
  if (conflicts.length === 0) return null;
  const fingerprint = officialIncidentFingerprint(ipoId, kind, decision);
  const now = decision.evidence.capturedAt;
  return tx.officialEvidenceIncident.upsert({
    where: { fingerprint },
    create: {
      ipoId,
      fingerprint,
      kind,
      source: decision.evidence.source,
      fields: conflicts.map((comparison) => comparison.field).sort(),
      reasons: decision.reasons,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      source: decision.evidence.source,
      fields: conflicts.map((comparison) => comparison.field).sort(),
      reasons: decision.reasons,
      occurrenceCount: { increment: 1 },
      lastSeenAt: now,
    },
  });
}

export function officialAutoPublishEnabled(): boolean {
  return process.env.OFFICIAL_IPO_AUTO_PUBLISH_ENABLED === "true";
}
