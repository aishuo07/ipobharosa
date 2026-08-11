import { prisma } from "@/lib/prisma";
import { collectObservations, successfulValues } from "@/lib/gmp/ingest";
import { computeGmpSnapshot } from "@/lib/gmp/confidence";
import { ipoWatchAdapter } from "@/lib/gmp/adapters/ipowatch";
import { sahiAdapter } from "@/lib/gmp/adapters/sahi";
import { ipojiAdapter } from "@/lib/gmp/adapters/ipoji";
import { sahiSubscriptionAdapter } from "@/lib/subscription/adapters/sahi";
import { syncIpoStatuses } from "@/lib/ipo-status";
import { notifyWatchersOfTransitions } from "@/lib/email/reminders";
import type { GmpAdapter } from "@/lib/gmp/types";

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
  remindersSent: number;
};

export async function runIngestionCycle(): Promise<IngestionSummary> {
  const transitions = await syncIpoStatuses();
  const remindersSent = await notifyWatchersOfTransitions(transitions);

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
    remindersSent,
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
