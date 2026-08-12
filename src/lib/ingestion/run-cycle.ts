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

const ALERT_RECIPIENT = "aish.iiitb@gmail.com";

const GMP_ADAPTERS: GmpAdapter[] = [ipoWatchAdapter, sahiAdapter, ipojiAdapter];

// GMP is relevant right up to listing; subscription only exists during
// the open/awaiting-allotment window.
const GMP_ELIGIBLE_STATUSES = ["UPCOMING", "OPEN", "CLOSED"] as const;
const SUBSCRIPTION_ELIGIBLE_STATUSES = ["OPEN", "CLOSED"] as const;

export type IngestionSummary = {
  ipoCount: number;
  gmp: { snapshotsWritten: number; ipoWithNoData: number };
  subscription: { snapshotsWritten: number; failed: number };
  perSource: Record<string, { success: number; failure: number }>;
  statusTransitions: number;
  reminders: { sent: number; failed: number; skipped: number };
  discovery: DiscoverySummary | { error: string };
  skippedDueToLock?: boolean;
};

const EMPTY_SUMMARY: IngestionSummary = {
  ipoCount: 0,
  gmp: { snapshotsWritten: 0, ipoWithNoData: 0 },
  subscription: { snapshotsWritten: 0, failed: 0 },
  perSource: {},
  statusTransitions: 0,
  reminders: { sent: 0, failed: 0, skipped: 0 },
  discovery: { candidatesSeen: 0, alreadyTracked: 0, autoPublished: 0, draftsCreated: 0, quarantined: 0, fetchFailed: [], dbErrors: [], queueCapped: false },
};

/**
 * Public entry point: acquires the cron lock (refusing to run if another
 * invocation is already in flight — see lib/ingestion/lock.ts), runs the
 * actual cycle, always releases the lock, persists a structured
 * IngestionRun record either way, and emails a heads-up if anything in
 * the run looks wrong rather than leaving it to be noticed later.
 */
export async function runIngestionCycle(startedBy = "cron"): Promise<IngestionSummary> {
  const startedAt = new Date();
  const acquired = await acquireIngestionLock(startedBy);
  if (!acquired) {
    const summary = { ...EMPTY_SUMMARY, skippedDueToLock: true };
    await prisma.ingestionRun.create({
      data: { startedAt, finishedAt: new Date(), ok: true, skippedDueToLock: true, summary },
    });
    return summary;
  }

  let summary: IngestionSummary = EMPTY_SUMMARY;
  let ok = true;
  let error: string | undefined;
  try {
    summary = await runIngestionCycleInner();
  } catch (e) {
    ok = false;
    error = (e as Error).message;
    throw e;
  } finally {
    await releaseIngestionLock();
    await prisma.ingestionRun.create({
      data: { startedAt, finishedAt: new Date(), ok, summary, error },
    });

    const reasons = ok ? computeAlertReasons(summary) : [`Ingestion cycle crashed entirely: ${error}`];
    if (reasons.length > 0) {
      try {
        await sendEmail({
          to: ALERT_RECIPIENT,
          subject: `IPOBharosa ingestion alert: ${reasons.length} issue(s)`,
          html: `<p>This ingestion run flagged:</p><ul>${reasons.map((r) => `<li>${r}</li>`).join("")}</ul><pre>${JSON.stringify(summary, null, 2)}</pre>`,
        });
      } catch (e) {
        // An alert-email failure must never mask the run's own result.
        console.error("Failed to send ingestion alert email:", (e as Error).message);
      }
    }
  }
  return summary;
}

async function runIngestionCycleInner(): Promise<IngestionSummary> {
  const transitions = await syncIpoStatuses();
  const reminders = await notifyWatchersOfTransitions(transitions);

  // New-IPO discovery is independent of everything else in this cycle —
  // a failure here (e.g. the source's page layout changed) shouldn't
  // block GMP/subscription ingestion or reminders from still running.
  let discovery: IngestionSummary["discovery"];
  try {
    discovery = await runDiscovery();
  } catch (e) {
    discovery = { error: (e as Error).message };
  }

  const sourceRows = await Promise.all(
    GMP_ADAPTERS.map((adapter) =>
      prisma.gmpSource.upsert({
        where: { adapterKey: adapter.key },
        update: { name: adapter.name, active: true },
        create: { name: adapter.name, baseUrl: "n/a", adapterKey: adapter.key, active: true },
      }),
    ),
  );
  const sourceIdByKey = new Map(sourceRows.map((s) => [s.adapterKey, s.id]));

  const ipos = await prisma.ipo.findMany({
    where: { status: { in: [...GMP_ELIGIBLE_STATUSES] } },
    include: { company: true },
  });

  const summary: IngestionSummary = {
    ipoCount: ipos.length,
    gmp: { snapshotsWritten: 0, ipoWithNoData: 0 },
    subscription: { snapshotsWritten: 0, failed: 0 },
    perSource: Object.fromEntries(GMP_ADAPTERS.map((a) => [a.key, { success: 0, failure: 0 }])),
    statusTransitions: transitions.length,
    reminders,
    discovery,
  };

  for (const ipo of ipos) {
    const observations = await collectObservations(ipo.company.name, GMP_ADAPTERS);
    const capturedAt = new Date();

    await Promise.all(
      observations.map(async (obs) => {
        const sourceId = sourceIdByKey.get(obs.sourceKey);
        if (!sourceId) return;

        summary.perSource[obs.sourceKey][obs.success ? "success" : "failure"]++;

        await prisma.gmpObservation.create({
          data: {
            ipoId: ipo.id,
            sourceId,
            value: obs.success ? obs.value : null,
            success: obs.success,
            errorMessage: obs.success ? null : obs.error,
            capturedAt,
          },
        });

        await prisma.sourceHealth.upsert({
          where: { sourceId },
          update: obs.success
            ? { lastSuccessAt: capturedAt, lastError: null, consecutiveFailures: 0, degraded: false }
            : {
                lastError: obs.error,
                consecutiveFailures: { increment: 1 },
              },
          create: obs.success
            ? { sourceId, lastSuccessAt: capturedAt, consecutiveFailures: 0, degraded: false }
            : { sourceId, lastError: obs.error, consecutiveFailures: 1 },
        });
      }),
    );

    // A source that's failed several cycles in a row is marked degraded —
    // still retried every cycle (nothing here excludes it above), just
    // flagged for observability.
    const health = await prisma.sourceHealth.findMany({
      where: { sourceId: { in: [...sourceIdByKey.values()] } },
    });
    await Promise.all(
      health
        .filter((h) => h.consecutiveFailures >= 3 && !h.degraded)
        .map((h) => prisma.sourceHealth.update({ where: { id: h.id }, data: { degraded: true } })),
    );

    const values = successfulValues(observations);
    const snapshot = computeGmpSnapshot(values);
    if (snapshot) {
      await prisma.gmpSnapshot.create({
        data: {
          ipoId: ipo.id,
          medianValue: snapshot.medianValue,
          sourceCount: snapshot.sourceCount,
          maxDeviation: snapshot.maxDeviation,
          confidence: snapshot.confidence,
          capturedAt,
        },
      });
      summary.gmp.snapshotsWritten++;
    } else {
      // All sources failed this cycle — deliberately not writing a
      // snapshot, so the API keeps serving the last real one instead of
      // inventing a value.
      summary.gmp.ipoWithNoData++;
    }

    if ((SUBSCRIPTION_ELIGIBLE_STATUSES as readonly string[]).includes(ipo.status)) {
      try {
        const sub = await sahiSubscriptionAdapter.fetchSubscription(ipo.company.name);
        await prisma.subscriptionSnapshot.create({
          data: {
            ipoId: ipo.id,
            qibX: sub.qibX,
            niiX: sub.niiX,
            retailX: sub.retailX,
            employeeX: sub.employeeX,
            sourceExchange: sub.sourceExchange,
            capturedAt,
          },
        });
        summary.subscription.snapshotsWritten++;
      } catch {
        summary.subscription.failed++;
      }
    }
  }

  return summary;
}
