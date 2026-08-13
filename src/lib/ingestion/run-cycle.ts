import { prisma } from "@/lib/prisma";
import { collectObservations, successfulValues } from "@/lib/gmp/ingest";
import { computeGmpSnapshot } from "@/lib/gmp/confidence";
import { ipoWatchAdapter } from "@/lib/gmp/adapters/ipowatch";
import { sahiAdapter } from "@/lib/gmp/adapters/sahi";
import { ipojiAdapter } from "@/lib/gmp/adapters/ipoji";
import { sahiSubscriptionAdapter } from "@/lib/subscription/adapters/sahi";
import { syncIpoStatuses } from "@/lib/ipo-status";
import { notifyWatchersOfTransitions } from "@/lib/email/reminders";
import { runDiscovery, type DiscoverySummary } from "@/lib/discovery/discover";
import { acquireIngestionLock, releaseIngestionLock } from "@/lib/ingestion/lock";
import { computeAlertReasons } from "@/lib/ingestion/alert";
import { sendEmail } from "@/lib/email/resend";
import type { GmpAdapter } from "@/lib/gmp/types";
import { captureFilingEvidence } from "@/lib/financials/filing-evidence";
import { filingEvidenceClass } from "@/lib/document-evidence";
import { syncOfficialFilingCatalogue, type FilingCatalogueSync } from "@/lib/discovery/filing-catalogue";

const ALERT_RECIPIENT = "aish.iiitb@gmail.com";
const BATCH_SIZE = 3;
const GMP_ADAPTERS: GmpAdapter[] = [ipoWatchAdapter, sahiAdapter, ipojiAdapter];
const GMP_ELIGIBLE_STATUSES = ["UPCOMING", "OPEN", "CLOSED"] as const;
const SUBSCRIPTION_ELIGIBLE_STATUSES = ["OPEN", "CLOSED"] as const;

export type IngestionStage = "prepare" | "filings" | "gmp" | "subscription" | "finalize" | "complete";

export type IngestionSummary = {
  ipoCount: number;
  gmp: { snapshotsWritten: number; ipoWithNoData: number };
  subscription: { snapshotsWritten: number; failed: number };
  perSource: Record<string, { success: number; failure: number }>;
  statusTransitions: number;
  reminders: { sent: number; failed: number; skipped: number };
  discovery: DiscoverySummary | { error: string };
  catalogue: FilingCatalogueSync;
  filings: { captured: number; skipped: number; failed: { ipoName: string; error: string }[] };
  skippedDueToLock?: boolean;
};

export type IngestionCheckpoint = {
  version: 1;
  stage: IngestionStage;
  cursor: number;
  attempts: number;
  lastError: string | null;
  summary: IngestionSummary;
};

export type IngestionStepResult = {
  runId: string | null;
  complete: boolean;
  checkpoint: IngestionCheckpoint;
};

export const EMPTY_SUMMARY: IngestionSummary = {
  ipoCount: 0,
  gmp: { snapshotsWritten: 0, ipoWithNoData: 0 },
  subscription: { snapshotsWritten: 0, failed: 0 },
  perSource: {},
  statusTransitions: 0,
  reminders: { sent: 0, failed: 0, skipped: 0 },
  discovery: { candidatesSeen: 0, alreadyTracked: 0, autoPublished: 0, draftsCreated: 0, quarantined: 0, fetchFailed: [], dbErrors: [], queueCapped: false, deferredCandidates: 0 },
  catalogue: { seen: 0, stored: 0, linked: 0 },
  filings: { captured: 0, skipped: 0, failed: [] },
};

export function initialCheckpoint(): IngestionCheckpoint {
  return { version: 1, stage: "prepare", cursor: 0, attempts: 0, lastError: null, summary: structuredClone(EMPTY_SUMMARY) };
}

export function readCheckpoint(value: unknown): IngestionCheckpoint {
  if (!value || typeof value !== "object") return initialCheckpoint();
  const candidate = value as Partial<IngestionCheckpoint>;
  if (candidate.version !== 1 || !candidate.stage || !candidate.summary) return initialCheckpoint();
  return {
    version: 1,
    stage: candidate.stage,
    cursor: Number.isInteger(candidate.cursor) ? candidate.cursor ?? 0 : 0,
    attempts: Number.isInteger(candidate.attempts) ? candidate.attempts ?? 0 : 0,
    lastError: typeof candidate.lastError === "string" ? candidate.lastError : null,
    summary: {
      ...candidate.summary,
      catalogue: candidate.summary.catalogue ?? structuredClone(EMPTY_SUMMARY.catalogue),
      filings: candidate.summary.filings ?? structuredClone(EMPTY_SUMMARY.filings),
    },
  };
}

function nextStage(checkpoint: IngestionCheckpoint, stage: IngestionStage): IngestionCheckpoint {
  return { ...checkpoint, stage, cursor: 0, lastError: null };
}

async function persistCheckpoint(runId: string, checkpoint: IngestionCheckpoint, complete = false) {
  await prisma.ingestionRun.update({
    where: { id: runId },
    data: {
      summary: checkpoint,
      error: checkpoint.lastError,
      ok: complete,
      finishedAt: complete ? new Date() : null,
    },
  });
}

async function getOrCreateRun() {
  const active = await prisma.ingestionRun.findFirst({
    where: { finishedAt: null, skippedDueToLock: false },
    orderBy: { startedAt: "desc" },
  });
  if (active) return active;
  return prisma.ingestionRun.create({ data: { ok: false, summary: initialCheckpoint() } });
}

/** Executes one bounded, resumable unit of work. The caller repeats until complete. */
export async function runIngestionStep(startedBy = "cron"): Promise<IngestionStepResult> {
  const acquired = await acquireIngestionLock(startedBy);
  if (!acquired) {
    return { runId: null, complete: false, checkpoint: { ...initialCheckpoint(), summary: { ...EMPTY_SUMMARY, skippedDueToLock: true } } };
  }

  let runId: string | null = null;
  let checkpoint = initialCheckpoint();
  try {
    const run = await getOrCreateRun();
    runId = run.id;
    checkpoint = readCheckpoint(run.summary);
    checkpoint = { ...checkpoint, attempts: checkpoint.attempts + 1, lastError: null };

    if (checkpoint.stage === "prepare") checkpoint = await runPrepare(checkpoint);
    else if (checkpoint.stage === "filings") checkpoint = await runFilingBatch(checkpoint);
    else if (checkpoint.stage === "gmp") checkpoint = await runGmpBatch(run.id, run.startedAt, checkpoint);
    else if (checkpoint.stage === "subscription") checkpoint = await runSubscriptionBatch(run.id, run.startedAt, checkpoint);
    else if (checkpoint.stage === "finalize") checkpoint = nextStage(checkpoint, "complete");

    const complete = checkpoint.stage === "complete";
    await persistCheckpoint(run.id, checkpoint, complete);
    if (complete) await sendRunAlerts(checkpoint.summary);
    return { runId: run.id, complete, checkpoint };
  } catch (error) {
    checkpoint = { ...checkpoint, lastError: error instanceof Error ? error.message : String(error) };
    if (runId) await persistCheckpoint(runId, checkpoint);
    throw error;
  } finally {
    await releaseIngestionLock();
  }
}

async function runPrepare(checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  const transitions = await syncIpoStatuses();
  const reminders = await notifyWatchersOfTransitions(transitions);
  const catalogue = await syncOfficialFilingCatalogue();
  let discovery: IngestionSummary["discovery"];
  try {
    discovery = await runDiscovery();
  } catch (error) {
    discovery = { error: error instanceof Error ? error.message : String(error) };
  }
  const ipoCount = await prisma.ipo.count({ where: { status: { in: [...GMP_ELIGIBLE_STATUSES] } } });
  return nextStage({
    ...checkpoint,
    summary: {
      ...checkpoint.summary,
      ipoCount,
      statusTransitions: transitions.length,
      reminders,
      catalogue,
      discovery,
      perSource: Object.fromEntries(GMP_ADAPTERS.map((adapter) => [adapter.key, { success: 0, failure: 0 }])),
    },
  }, "filings");
}

async function runFilingBatch(checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  const ipos = await prisma.ipo.findMany({
    where: { publicationState: "PUBLISHED", OR: [{ rhpUrl: { not: null } }, { drhpUrl: { not: null } }] },
    include: { company: true },
    orderBy: { id: "asc" },
    skip: checkpoint.cursor,
    take: 1,
  });
  if (ipos.length === 0) return nextStage(checkpoint, "gmp");
  const ipo = ipos[0];
  const candidates = [
    ipo.rhpUrl ? { type: "RHP" as const, url: ipo.rhpUrl } : null,
    ipo.drhpUrl ? { type: "DRHP" as const, url: ipo.drhpUrl } : null,
  ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .filter((candidate) => filingEvidenceClass(candidate.url) !== "THIRD_PARTY");
  const summary = structuredClone(checkpoint.summary);
  const candidate = candidates[0];
  if (!candidate) {
    summary.filings.skipped++;
  } else {
    const exists = await prisma.financialDocument.findFirst({
      where: { ipoId: ipo.id, documentType: candidate.type, sourceUrl: candidate.url },
    });
    if (exists) summary.filings.skipped++;
    else {
      try {
        await captureFilingEvidence(ipo.id, candidate.type, candidate.url);
        summary.filings.captured++;
      } catch (error) {
        summary.filings.failed.push({ ipoName: ipo.company.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { ...checkpoint, cursor: checkpoint.cursor + 1, summary };
}

async function ensureSources() {
  const rows = await Promise.all(GMP_ADAPTERS.map((adapter) => prisma.gmpSource.upsert({
    where: { adapterKey: adapter.key },
    update: { name: adapter.name, active: true },
    create: { name: adapter.name, baseUrl: "n/a", adapterKey: adapter.key, active: true },
  })));
  return new Map(rows.map((row) => [row.adapterKey, row.id]));
}

async function runGmpBatch(runId: string, capturedAt: Date, checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  const ipos = await prisma.ipo.findMany({
    where: { status: { in: [...GMP_ELIGIBLE_STATUSES] } },
    include: { company: true },
    orderBy: { id: "asc" },
    skip: checkpoint.cursor,
    take: BATCH_SIZE,
  });
  if (ipos.length === 0) return nextStage(checkpoint, "subscription");
  const sourceIds = await ensureSources();
  let next = checkpoint;
  for (const ipo of ipos) {
    const observations = await collectObservations(ipo.company.name, GMP_ADAPTERS);
    const values = successfulValues(observations);
    const snapshot = computeGmpSnapshot(values);
    const summary = structuredClone(next.summary);
    for (const observation of observations) summary.perSource[observation.sourceKey][observation.success ? "success" : "failure"]++;
    if (snapshot) summary.gmp.snapshotsWritten++;
    else summary.gmp.ipoWithNoData++;
    const advanced = { ...next, cursor: next.cursor + 1, summary };

    await prisma.$transaction(async (tx) => {
      const alreadyDone = await tx.gmpObservation.count({ where: { ipoId: ipo.id, capturedAt } });
      if (alreadyDone === 0) {
        for (const observation of observations) {
          const sourceId = sourceIds.get(observation.sourceKey);
          if (!sourceId) continue;
          await tx.gmpObservation.create({ data: {
            ipoId: ipo.id, sourceId, capturedAt,
            value: observation.success ? observation.value : null,
            success: observation.success,
            errorMessage: observation.success ? null : observation.error,
          } });
          await tx.sourceHealth.upsert({
            where: { sourceId },
            update: observation.success
              ? { lastSuccessAt: capturedAt, lastError: null, consecutiveFailures: 0, degraded: false }
              : { lastError: observation.error, consecutiveFailures: { increment: 1 } },
            create: observation.success
              ? { sourceId, lastSuccessAt: capturedAt, consecutiveFailures: 0, degraded: false }
              : { sourceId, lastError: observation.error, consecutiveFailures: 1 },
          });
        }
        if (snapshot) await tx.gmpSnapshot.create({ data: { ipoId: ipo.id, ...snapshot, capturedAt } });
      }
      await tx.ingestionRun.update({ where: { id: runId }, data: { summary: advanced } });
    });
    next = advanced;
  }
  return next;
}

async function runSubscriptionBatch(runId: string, capturedAt: Date, checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  const ipos = await prisma.ipo.findMany({
    where: { status: { in: [...SUBSCRIPTION_ELIGIBLE_STATUSES] } },
    include: { company: true },
    orderBy: { id: "asc" },
    skip: checkpoint.cursor,
    take: BATCH_SIZE,
  });
  if (ipos.length === 0) return nextStage(checkpoint, "finalize");
  let next = checkpoint;
  for (const ipo of ipos) {
    let result: Awaited<ReturnType<typeof sahiSubscriptionAdapter.fetchSubscription>> | null = null;
    let failed = false;
    try { result = await sahiSubscriptionAdapter.fetchSubscription(ipo.company.name); }
    catch { failed = true; }
    const summary = structuredClone(next.summary);
    if (failed) summary.subscription.failed++;
    else summary.subscription.snapshotsWritten++;
    const advanced = { ...next, cursor: next.cursor + 1, summary };
    await prisma.$transaction(async (tx) => {
      const alreadyDone = await tx.subscriptionSnapshot.count({ where: { ipoId: ipo.id, capturedAt } });
      if (result && alreadyDone === 0) await tx.subscriptionSnapshot.create({ data: { ipoId: ipo.id, ...result, capturedAt } });
      await tx.ingestionRun.update({ where: { id: runId }, data: { summary: advanced } });
    });
    next = advanced;
  }
  return next;
}

async function sendRunAlerts(summary: IngestionSummary) {
  const reasons = computeAlertReasons(summary);
  if (reasons.length === 0) return;
  try {
    await sendEmail({
      to: ALERT_RECIPIENT,
      subject: `IPOBharosa ingestion alert: ${reasons.length} issue(s)`,
      html: `<p>This ingestion run flagged:</p><ul>${reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul><pre>${JSON.stringify(summary, null, 2)}</pre>`,
    });
  } catch (error) {
    console.error("Failed to send ingestion alert email:", error instanceof Error ? error.message : String(error));
  }
}
