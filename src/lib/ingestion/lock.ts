import { prisma } from "@/lib/prisma";

const DEFAULT_LOCK_ID = "singleton";
// A route invocation has a hard 60-second ceiling. Anything still locked after
// 75 seconds cannot be live work and is safe for the next caller to recover.
// Keeping this close to the platform limit avoids turning one killed request
// into several minutes of no-op workflow polling.
const STALE_AFTER_MS = 75 * 1000;

/**
 * A single well-known row as a mutex. Acquiring is one conditional
 * UPDATE — Postgres serializes concurrent UPDATEs on the same row, so
 * at most one caller's WHERE clause matches and gets to flip
 * `runningSince`. No separate distributed-lock infrastructure needed
 * at this scale.
 */
export async function acquireIngestionLock(startedBy: string, lockId = DEFAULT_LOCK_ID): Promise<boolean> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_AFTER_MS);

  await prisma.ingestionLock.upsert({
    where: { id: lockId },
    update: {},
    create: { id: lockId },
  });

  const result = await prisma.ingestionLock.updateMany({
    where: {
      id: lockId,
      OR: [{ runningSince: null }, { runningSince: { lt: staleThreshold } }],
    },
    data: { runningSince: now, startedBy },
  });

  return result.count === 1;
}

export async function releaseIngestionLock(lockId = DEFAULT_LOCK_ID): Promise<void> {
  await prisma.ingestionLock.update({
    where: { id: lockId },
    data: { runningSince: null, startedBy: null },
  });
}
