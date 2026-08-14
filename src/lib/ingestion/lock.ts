import { prisma } from "@/lib/prisma";

const LOCK_ID = "singleton";
// A route invocation has a hard 60-second ceiling. Anything still locked after
// two minutes cannot be live work and is safe for the next caller to recover.
const STALE_AFTER_MS = 2 * 60 * 1000;

/**
 * A single well-known row as a mutex. Acquiring is one conditional
 * UPDATE — Postgres serializes concurrent UPDATEs on the same row, so
 * at most one caller's WHERE clause matches and gets to flip
 * `runningSince`. No separate distributed-lock infrastructure needed
 * at this scale.
 */
export async function acquireIngestionLock(startedBy: string): Promise<boolean> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_AFTER_MS);

  await prisma.ingestionLock.upsert({
    where: { id: LOCK_ID },
    update: {},
    create: { id: LOCK_ID },
  });

  const result = await prisma.ingestionLock.updateMany({
    where: {
      id: LOCK_ID,
      OR: [{ runningSince: null }, { runningSince: { lt: staleThreshold } }],
    },
    data: { runningSince: now, startedBy },
  });

  return result.count === 1;
}

export async function releaseIngestionLock(): Promise<void> {
  await prisma.ingestionLock.update({
    where: { id: LOCK_ID },
    data: { runningSince: null, startedBy: null },
  });
}
