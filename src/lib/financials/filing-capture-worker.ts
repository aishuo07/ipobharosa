import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { filingEvidenceClass, filingSourceHost } from "@/lib/document-evidence";
import { acquireIngestionLock, releaseIngestionLock } from "@/lib/ingestion/lock";
import { recordSourceFailure, recordSourceSuccess } from "@/lib/ingestion/source-operation";
import { captureFilingEvidence } from "./filing-evidence";

const LOCK_ID = "filing-evidence";
const MAX_IPOS_TO_SCAN = 250;

type FilingDocumentRef = { documentType: "DRHP" | "RHP" | string; sourceUrl: string };

export type FilingWorkerIpo = {
  id: string;
  company: { name: string };
  rhpUrl: string | null;
  drhpUrl: string | null;
  financialDocuments: FilingDocumentRef[];
};

export type FilingCaptureCandidate = {
  ipoId: string;
  companyName: string;
  documentType: "DRHP" | "RHP";
  sourceUrl: string;
  key: string;
};

export type FilingRetryState = { key: string; nextRetryAt: Date | null };

export type FilingWorkerResult = {
  complete: boolean;
  skippedDueToLock?: boolean;
  outcome: "CAPTURED" | "FAILED" | "IDLE" | "LOCKED";
  candidate?: Omit<FilingCaptureCandidate, "key">;
  documentId?: string;
  retryAt?: string;
  ready: number;
  waitingForRetry: number;
};

export function filingCaptureKey(candidate: Pick<FilingCaptureCandidate, "ipoId" | "documentType" | "sourceUrl">): string {
  const digest = createHash("sha256").update(`${candidate.ipoId}:${candidate.documentType}:${candidate.sourceUrl}`).digest("hex").slice(0, 24);
  return `filing-download:${digest}`;
}

/**
 * RHP is preferred over DRHP because it is the final pre-issue filing. Existing
 * captures and third-party copies are removed before any network request.
 */
export function buildFilingCaptureCandidates(ipos: FilingWorkerIpo[]): FilingCaptureCandidate[] {
  return ipos.flatMap((ipo) => {
    const existing = new Set(ipo.financialDocuments.map((document) => `${document.documentType}:${document.sourceUrl}`));
    return [
      ipo.rhpUrl ? { documentType: "RHP" as const, sourceUrl: ipo.rhpUrl } : null,
      ipo.drhpUrl ? { documentType: "DRHP" as const, sourceUrl: ipo.drhpUrl } : null,
    ]
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .filter((candidate) => filingEvidenceClass(candidate.sourceUrl) !== "THIRD_PARTY")
      .filter((candidate) => !existing.has(`${candidate.documentType}:${candidate.sourceUrl}`))
      .map((candidate) => {
        const value = { ipoId: ipo.id, companyName: ipo.company.name, ...candidate };
        return { ...value, key: filingCaptureKey(value) };
      });
  });
}

export function selectReadyFilingCandidate(
  candidates: FilingCaptureCandidate[],
  retryStates: FilingRetryState[],
  now = new Date(),
): { candidate: FilingCaptureCandidate | null; ready: number; waitingForRetry: number } {
  const retryByKey = new Map(retryStates.map((state) => [state.key, state.nextRetryAt]));
  const ready = candidates.filter((candidate) => {
    const retryAt = retryByKey.get(candidate.key);
    return !retryAt || retryAt <= now;
  });
  return { candidate: ready[0] ?? null, ready: ready.length, waitingForRetry: candidates.length - ready.length };
}

async function nextCandidate(now: Date) {
  const ipos = await prisma.ipo.findMany({
    where: {
      publicationState: "PUBLISHED",
      OR: [{ rhpUrl: { not: null } }, { drhpUrl: { not: null } }],
    },
    select: {
      id: true,
      rhpUrl: true,
      drhpUrl: true,
      company: { select: { name: true } },
      financialDocuments: { select: { documentType: true, sourceUrl: true } },
    },
    // Recent issues are the most useful to visitors; IDs keep the order stable.
    orderBy: [{ listingDate: "desc" }, { id: "asc" }],
    take: MAX_IPOS_TO_SCAN,
  });
  const candidates = buildFilingCaptureCandidates(ipos);
  if (candidates.length === 0) return { candidate: null, ready: 0, waitingForRetry: 0 };
  const retryStates = await prisma.sourceOperationHealth.findMany({
    where: { key: { in: candidates.map((candidate) => candidate.key) } },
    select: { key: true, nextRetryAt: true },
  });
  return selectReadyFilingCandidate(candidates, retryStates, now);
}

/** Runs one remote PDF capture, independently from time-sensitive market data. */
export async function runFilingCaptureStep(startedBy = "filing-cron", now = new Date()): Promise<FilingWorkerResult> {
  const acquired = await acquireIngestionLock(startedBy, LOCK_ID);
  if (!acquired) return { complete: false, skippedDueToLock: true, outcome: "LOCKED", ready: 0, waitingForRetry: 0 };

  try {
    const selection = await nextCandidate(now);
    const candidate = selection.candidate;
    if (!candidate) return { complete: true, outcome: "IDLE", ready: selection.ready, waitingForRetry: selection.waitingForRetry };

    const publicCandidate = {
      ipoId: candidate.ipoId,
      companyName: candidate.companyName,
      documentType: candidate.documentType,
      sourceUrl: candidate.sourceUrl,
    };
    const source = filingSourceHost(candidate.sourceUrl);
    try {
      const capture = await captureFilingEvidence(candidate.ipoId, candidate.documentType, candidate.sourceUrl);
      await recordSourceSuccess(candidate.key, source, "filing-download");
      return {
        complete: false,
        outcome: "CAPTURED",
        candidate: publicCandidate,
        documentId: capture.documentId,
        ready: Math.max(0, selection.ready - 1),
        waitingForRetry: selection.waitingForRetry,
      };
    } catch (error) {
      const retryAt = await recordSourceFailure(candidate.key, source, "filing-download", error, now);
      return {
        complete: false,
        outcome: "FAILED",
        candidate: publicCandidate,
        retryAt: retryAt.toISOString(),
        ready: Math.max(0, selection.ready - 1),
        waitingForRetry: selection.waitingForRetry + 1,
      };
    }
  } finally {
    await releaseIngestionLock(LOCK_ID);
  }
}
