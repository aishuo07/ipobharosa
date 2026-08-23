import { prisma } from "@/lib/prisma";
import { collectObservations, successfulValues } from "@/lib/gmp/ingest";
import { computeGmpSnapshot } from "@/lib/gmp/confidence";
import { ipoWatchAdapter } from "@/lib/gmp/adapters/ipowatch";
import { sahiAdapter } from "@/lib/gmp/adapters/sahi";
import { ipojiAdapter } from "@/lib/gmp/adapters/ipoji";
import { investorGainAdapter } from "@/lib/gmp/adapters/investorgain";
import { ipoTrackAdapter } from "@/lib/gmp/adapters/ipotrack";
import { nseSubscriptionAdapter } from "@/lib/subscription/adapters/nse";
import { syncIpoStatuses } from "@/lib/ipo-status";
import { syncIpoListings } from "@/lib/ipo-listing";
import { notifyWatchersOfTransitions } from "@/lib/email/reminders";
import type { DiscoverySummary } from "@/lib/discovery/discover";
import { acquireIngestionLock, releaseIngestionLock } from "@/lib/ingestion/lock";
import { computeAlertReasons } from "@/lib/ingestion/alert";
import { sendEmail } from "@/lib/email/resend";
import type { GmpAdapter } from "@/lib/gmp/types";
import { syncOfficialFilingCatalogue, type FilingCatalogueSync } from "@/lib/discovery/filing-catalogue";
import { countRevalidationCandidates, revalidateOldestCandidate } from "@/lib/discovery/revalidate";
import { countPublishedRevalidationCandidates, revalidateOldestPublished } from "@/lib/discovery/revalidate-published";
import { recordSourceFailure, recordSourceSuccess } from "@/lib/ingestion/source-operation";
import { withTransientRetries } from "@/lib/ingestion/source-operation";
import { providerErrorResult, providerResultMessage } from "@/lib/ingestion/provider-result";
import { sendDailyDigestIfDue } from "@/lib/ingestion/digest";
import { resolveSiteUrl } from "@/lib/site-url";
import { marketFinalizationCutoff } from "@/lib/ingestion/market-window";
import { enabledGmpAdapters } from "@/lib/source-policy";
import { pipelineLog, stageTimer } from "@/lib/ingestion/logger";

const ALERT_RECIPIENT = "aish.iiitb@gmail.com";
const SITE_URL = resolveSiteUrl();
const BATCH_SIZE = 3;
const ALL_GMP_ADAPTERS: GmpAdapter[] = [ipoWatchAdapter, sahiAdapter, ipojiAdapter, investorGainAdapter, ipoTrackAdapter];
const activeGmpAdapters = () => enabledGmpAdapters(ALL_GMP_ADAPTERS);
// Candidate checks are bounded so the workflow still has ample calls for GMP,
// subscription and finalization. Remote PDF work is intentionally excluded
// from this budget and runs in the daily filing-evidence worker.
const REVALIDATION_PER_RUN = 32;
const PUBLISHED_REVALIDATION_PER_RUN = 4;

// `filings` remains readable so an in-flight checkpoint written by an older
// deployment can be advanced safely. New runs never enter that stage: remote
// PDF downloads run in the independent daily filing-evidence worker.
export type IngestionStage = "prepare" | "catalogue" | "discovery" | "revalidation" | "publishedRevalidation" | "filings" | "gmp" | "subscription" | "finalize" | "complete";

export type IngestionSummary = {
  ipoCount: number;
  gmp: { snapshotsWritten: number; ipoWithNoData: number };
  subscription: { snapshotsWritten: number; failed: number; notYetAvailable: number; notCovered: number };
  perSource: Record<string, { success: number; failure: number; notYetAvailable: number; notCovered: number }>;
  statusTransitions: number;
  listedTransitions: number;
  reminders: { sent: number; failed: number; skipped: number };
  discovery: DiscoverySummary | { error: string };
  catalogue: FilingCatalogueSync;
  revalidation: { target: number; checked: number; published: number; eligibleHeld: number; retries: number; exceptions: number; wrongTypes: number; invalid: number };
  publishedRevalidation: { target: number; checked: number; matched: number; drifts: number; retries: number; invalid: number };
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
  subscription: { snapshotsWritten: 0, failed: 0, notYetAvailable: 0, notCovered: 0 },
  perSource: {},
  statusTransitions: 0,
  listedTransitions: 0,
  reminders: { sent: 0, failed: 0, skipped: 0 },
  discovery: { candidatesSeen: 0, alreadyTracked: 0, autoPublished: 0, draftsCreated: 0, quarantined: 0, rejectedWrongType: 0, fetchFailed: [], dbErrors: [], queueCapped: false, deferredCandidates: 0 },
  catalogue: { seen: 0, stored: 0, linked: 0 },
  revalidation: { target: 0, checked: 0, published: 0, eligibleHeld: 0, retries: 0, exceptions: 0, wrongTypes: 0, invalid: 0 },
  publishedRevalidation: { target: 0, checked: 0, matched: 0, drifts: 0, retries: 0, invalid: 0 },
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
      revalidation: candidate.summary.revalidation ?? structuredClone(EMPTY_SUMMARY.revalidation),
      publishedRevalidation: candidate.summary.publishedRevalidation ?? structuredClone(EMPTY_SUMMARY.publishedRevalidation),
      filings: candidate.summary.filings ?? structuredClone(EMPTY_SUMMARY.filings),
      subscription: {
        ...structuredClone(EMPTY_SUMMARY.subscription),
        ...candidate.summary.subscription,
      },
      perSource: Object.fromEntries(Object.entries(candidate.summary.perSource ?? {}).map(([key, source]) => [key, {
        success: source.success ?? 0,
        failure: source.failure ?? 0,
        notYetAvailable: source.notYetAvailable ?? 0,
        notCovered: source.notCovered ?? 0,
      }])),
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
    pipelineLog.warn("Ingestion lock busy, skipping", { startedBy });
    return { runId: null, complete: false, checkpoint: { ...initialCheckpoint(), summary: { ...EMPTY_SUMMARY, skippedDueToLock: true } } };
  }

  let runId: string | null = null;
  let checkpoint = initialCheckpoint();
  const pipelineStart = Date.now();
  try {
    const run = await getOrCreateRun();
    runId = run.id;
    checkpoint = readCheckpoint(run.summary);
    checkpoint = { ...checkpoint, attempts: checkpoint.attempts + 1, lastError: null };

    pipelineLog.info("Pipeline starting", { stage: checkpoint.stage, attempt: checkpoint.attempts, runId });

    // Run up to 4 stages per invocation for speed (was: 1 stage)
    const MAX_STAGES_PER_RUN = 8;
    for (let i = 0; i < MAX_STAGES_PER_RUN; i++) {
      const stageStart = Date.now();
      const stage = checkpoint.stage;

      if (checkpoint.stage === "prepare") checkpoint = await runPrepare(checkpoint);
      else if (checkpoint.stage === "catalogue") checkpoint = await runCatalogue(checkpoint);
      else if (checkpoint.stage === "discovery") checkpoint = await runDiscoveryStep(checkpoint);
      else if (checkpoint.stage === "revalidation") checkpoint = await runRevalidationBatch(checkpoint);
      else if (checkpoint.stage === "publishedRevalidation") checkpoint = await runPublishedRevalidationBatch(checkpoint);
      else if (checkpoint.stage === "filings") checkpoint = nextStage(checkpoint, "gmp");
      else if (checkpoint.stage === "gmp") checkpoint = await runGmpBatch(run.id, run.startedAt, checkpoint);
      else if (checkpoint.stage === "subscription") checkpoint = await runSubscriptionBatch(run.id, run.startedAt, checkpoint);
      else if (checkpoint.stage === "finalize") checkpoint = nextStage(checkpoint, "complete");

      const stageDuration = Date.now() - stageStart;
      pipelineLog.info(`Stage "${stage}" done → "${checkpoint.stage}"`, { stage, nextStage: checkpoint.stage, durationMs: stageDuration, runId });

      if (checkpoint.stage === "complete") break;
    }

    const complete = checkpoint.stage === "complete";
    await persistCheckpoint(run.id, checkpoint, complete);

    const totalDuration = Date.now() - pipelineStart;
    if (complete) {
      pipelineLog.info("Pipeline complete", { runId, totalDurationMs: totalDuration, ipoCount: checkpoint.summary.ipoCount });
      await sendRunAlerts(checkpoint.summary);
      await sendDailyDigestIfDue(checkpoint.summary);
    } else {
      pipelineLog.info("Pipeline partial (multi-stage batch)", { runId, stage: checkpoint.stage, totalDurationMs: totalDuration });
    }

    return { runId: run.id, complete, checkpoint };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    pipelineLog.error("Pipeline crashed", { runId, error: msg, durationMs: Date.now() - pipelineStart });
    checkpoint = { ...checkpoint, lastError: msg };
    if (runId) await persistCheckpoint(runId, checkpoint);
    throw error;
  } finally {
    await releaseIngestionLock();
  }
}

async function runPrepare(checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  const timer = stageTimer("prepare");
  const transitions = await syncIpoStatuses();
  const listings = await syncIpoListings();
  const reminders = await notifyWatchersOfTransitions([...transitions, ...listings]);
  timer.finish({ transitions: transitions.length, listings: listings.length, reminders: reminders.sent });
  return nextStage({
    ...checkpoint,
    summary: {
      ...checkpoint.summary,
      statusTransitions: transitions.length,
      listedTransitions: listings.length,
      reminders,
    },
  }, "catalogue");
}

async function runCatalogue(checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  const timer = stageTimer("catalogue");
  const catalogue = await syncOfficialFilingCatalogue();
  if (catalogue.error) await recordSourceFailure("sebi:filing-catalogue", "SEBI", "filing-catalogue", catalogue.error);
  else await recordSourceSuccess("sebi:filing-catalogue", "SEBI", "filing-catalogue");
  timer.finish({ seen: catalogue.seen, stored: catalogue.stored, linked: catalogue.linked, error: catalogue.error ?? null });
  return nextStage({
    ...checkpoint,
    summary: { ...checkpoint.summary, catalogue },
  }, "discovery");
}

async function runDiscoveryStep(checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  // The SEBI filing catalogue is the launch-safe discovery radar. Legacy
  // IPOWatch discovery is intentionally not called because its reviewed terms
  // conflict with the intended commercial product use.
  const discovery: IngestionSummary["discovery"] = checkpoint.summary.catalogue.error
    ? { error: checkpoint.summary.catalogue.error }
    : {
        ...structuredClone(EMPTY_SUMMARY.discovery as DiscoverySummary),
        candidatesSeen: checkpoint.summary.catalogue.seen,
        alreadyTracked: checkpoint.summary.catalogue.linked,
        deferredCandidates: Math.max(0, checkpoint.summary.catalogue.seen - checkpoint.summary.catalogue.linked),
      };
  const gmpAdapters = activeGmpAdapters();
  const ipoCount = await prisma.ipo.count({ where: gmpEligibilityWhere() });
  const revalidationTarget = Math.min(await countRevalidationCandidates(), REVALIDATION_PER_RUN);
  const publishedRevalidationTarget = Math.min(await countPublishedRevalidationCandidates(), PUBLISHED_REVALIDATION_PER_RUN);
  return nextStage({
    ...checkpoint,
    summary: {
      ...checkpoint.summary,
      ipoCount,
      discovery,
      revalidation: { ...checkpoint.summary.revalidation, target: revalidationTarget },
      publishedRevalidation: { ...checkpoint.summary.publishedRevalidation, target: publishedRevalidationTarget },
      perSource: Object.fromEntries(gmpAdapters.map((adapter) => [adapter.key, { success: 0, failure: 0, notYetAvailable: 0, notCovered: 0 }])),
    },
  }, "revalidation");
}

async function runRevalidationBatch(checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  if (checkpoint.summary.revalidation.checked >= checkpoint.summary.revalidation.target) {
    return nextStage(checkpoint, "publishedRevalidation");
  }
  const result = await revalidateOldestCandidate();
  if (result.outcome === "EMPTY") return nextStage(checkpoint, "publishedRevalidation");
  const summary = structuredClone(checkpoint.summary);
  summary.revalidation.checked++;
  if (result.outcome === "PUBLISHED") summary.revalidation.published++;
  else if (result.outcome === "ELIGIBLE_HELD") summary.revalidation.eligibleHeld++;
  else if (result.outcome === "RETRY") summary.revalidation.retries++;
  else if (result.outcome === "EXCEPTION") summary.revalidation.exceptions++;
  else if (result.outcome === "WRONG_TYPE") summary.revalidation.wrongTypes++;
  else if (result.outcome === "INVALID") summary.revalidation.invalid++;
  return { ...checkpoint, cursor: checkpoint.cursor + 1, summary };
}

async function runPublishedRevalidationBatch(checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  if (checkpoint.summary.publishedRevalidation.checked >= checkpoint.summary.publishedRevalidation.target) {
    return nextStage(checkpoint, "gmp");
  }
  const result = await revalidateOldestPublished();
  if (result.outcome === "EMPTY") return nextStage(checkpoint, "gmp");
  const summary = structuredClone(checkpoint.summary);
  summary.publishedRevalidation.checked++;
  if (result.outcome === "MATCHED") summary.publishedRevalidation.matched++;
  else if (result.outcome === "DRIFT") {
    summary.publishedRevalidation.drifts++;
    if (result.newIncident) {
      try {
        await sendEmail({
          to: ALERT_RECIPIENT,
          subject: `IPOBharosa published data changed: ${result.company}`,
          html: `<p>Official source values now differ for <strong>${result.company}</strong>.</p><ul>${result.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul><p>Public data was not changed. <a href="${SITE_URL}/admin">Review the incident</a>.</p>`,
        });
      } catch (error) {
        console.error("Failed to send published drift alert:", error instanceof Error ? error.message : String(error));
      }
    }
  }
  else if (result.outcome === "RETRY") summary.publishedRevalidation.retries++;
  else if (result.outcome === "INVALID") summary.publishedRevalidation.invalid++;
  return { ...checkpoint, cursor: checkpoint.cursor + 1, summary };
}

async function ensureSources(adapters: GmpAdapter[]) {
  await prisma.gmpSource.updateMany({ data: { active: false } });
  const rows = await Promise.all(adapters.map((adapter) => prisma.gmpSource.upsert({
    where: { adapterKey: adapter.key },
    update: { name: adapter.name, active: true },
    create: { name: adapter.name, baseUrl: "n/a", adapterKey: adapter.key, active: true },
  })));
  return new Map(rows.map((row) => [row.adapterKey, row.id]));
}

function gmpEligibilityWhere(now = new Date()) {
  return {
    OR: [
      { status: "UPCOMING" as const },
      { status: "OPEN" as const },
      { status: "CLOSED" as const, listingDate: { gte: marketFinalizationCutoff(now) } },
    ],
  };
}

function subscriptionEligibilityWhere(now = new Date()) {
  return {
    OR: [
      { status: "OPEN" as const },
      { status: "CLOSED" as const, listingDate: { gte: marketFinalizationCutoff(now) } },
    ],
  };
}

async function runGmpBatch(runId: string, capturedAt: Date, checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  const timer = stageTimer("gmp");
  const ipos = await prisma.ipo.findMany({
    where: gmpEligibilityWhere(),
    include: { company: true },
    orderBy: { id: "asc" },
    skip: checkpoint.cursor,
    take: BATCH_SIZE,
  });
  if (ipos.length === 0) { timer.finish({ iposProcessed: 0 }); return nextStage(checkpoint, "subscription"); }
  const gmpAdapters = activeGmpAdapters();
  const sourceIds = await ensureSources(gmpAdapters);
  pipelineLog.info("GMP batch starting", { ipos: ipos.map(i => i.company.name), adapters: gmpAdapters.map(a => a.key), cursor: checkpoint.cursor });
  let next = checkpoint;
  for (const ipo of ipos) {
    const observations = await collectObservations(ipo.company.name, gmpAdapters);
    const values = successfulValues(observations);
    const snapshot = computeGmpSnapshot(values);
    const summary = structuredClone(next.summary);
    for (const observation of observations) {
      const source = summary.perSource[observation.sourceKey];
      if (observation.kind === "VALUE") source.success++;
      else if (observation.kind === "NOT_YET_AVAILABLE") source.notYetAvailable++;
      else if (observation.kind === "NOT_COVERED") source.notCovered++;
      else source.failure++;
    }
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
            value: observation.kind === "VALUE" ? observation.value : null,
            success: observation.kind === "VALUE",
            errorMessage: observation.kind === "VALUE" ? null : providerResultMessage(observation),
          } });
          if (observation.kind === "VALUE") {
            await tx.sourceHealth.upsert({
              where: { sourceId },
              update: { lastSuccessAt: capturedAt, lastError: null, consecutiveFailures: 0, degraded: false },
              create: { sourceId, lastSuccessAt: capturedAt, consecutiveFailures: 0, degraded: false },
            });
          } else if (observation.kind === "ERROR") {
            const current = await tx.sourceHealth.findUnique({ where: { sourceId }, select: { consecutiveFailures: true } });
            const failures = (current?.consecutiveFailures ?? 0) + 1;
            await tx.sourceHealth.upsert({
              where: { sourceId },
              update: { lastError: observation.reason, consecutiveFailures: failures, degraded: failures >= 3 },
              create: { sourceId, lastError: observation.reason, consecutiveFailures: failures, degraded: failures >= 3 },
            });
          }
        }
        if (snapshot) await tx.gmpSnapshot.create({ data: { ipoId: ipo.id, ...snapshot, capturedAt } });
      }
      await tx.ingestionRun.update({ where: { id: runId }, data: { summary: advanced } });
    }, { timeout: 30000 });
    next = advanced;
  }
  return next;
}

async function runSubscriptionBatch(runId: string, capturedAt: Date, checkpoint: IngestionCheckpoint): Promise<IngestionCheckpoint> {
  const timer = stageTimer("subscription");
  const ipos = await prisma.ipo.findMany({
    where: subscriptionEligibilityWhere(),
    include: { company: true },
    orderBy: { id: "asc" },
    skip: checkpoint.cursor,
    take: BATCH_SIZE,
  });
  if (ipos.length === 0) { timer.finish({ iposProcessed: 0 }); return nextStage(checkpoint, "finalize"); }
  pipelineLog.info("Subscription batch starting", { ipos: ipos.map(i => i.company.name), cursor: checkpoint.cursor });
  let next = checkpoint;
  for (const ipo of ipos) {
    let result: Awaited<ReturnType<typeof nseSubscriptionAdapter.fetchSubscription>>;
    try { result = await withTransientRetries(() => nseSubscriptionAdapter.fetchSubscription(ipo.company.name)); }
    catch (error) { result = providerErrorResult(error); }
    const summary = structuredClone(next.summary);
    if (result.kind === "ERROR") {
      summary.subscription.failed++;
      await recordSourceFailure("nse:subscription", "NSE", "subscription", result.reason);
    } else if (result.kind === "NOT_YET_AVAILABLE") {
      summary.subscription.notYetAvailable++;
      await recordSourceSuccess("nse:subscription", "NSE", "subscription");
    } else if (result.kind === "NOT_COVERED") {
      summary.subscription.notCovered++;
      await recordSourceSuccess("nse:subscription", "NSE", "subscription");
    } else {
      summary.subscription.snapshotsWritten++;
      await recordSourceSuccess("nse:subscription", "NSE", "subscription");
    }
    const advanced = { ...next, cursor: next.cursor + 1, summary };
    await prisma.$transaction(async (tx) => {
      const alreadyDone = await tx.subscriptionSnapshot.count({ where: { ipoId: ipo.id, capturedAt } });
      if (result.kind === "VALUE" && alreadyDone === 0) await tx.subscriptionSnapshot.create({ data: { ipoId: ipo.id, ...result.value, capturedAt } });
      await tx.ingestionRun.update({ where: { id: runId }, data: { summary: advanced } });
    }, { timeout: 30000 });
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
