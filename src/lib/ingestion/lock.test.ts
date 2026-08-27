import { beforeEach, describe, expect, it, vi } from "vitest";

type LockRow = { id: string; runningSince: Date | null; startedBy: string | null };

let rows = new Map<string, LockRow>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestionLock: {
      upsert: async ({ create }: { create: LockRow }) => {
        const row = rows.get(create.id) ?? { ...create, runningSince: null, startedBy: null };
        rows.set(create.id, row);
        return row;
      },
      // Mirrors real Postgres semantics: the update only "matches" (and
      // therefore only takes effect) when the WHERE clause is satisfied
      // against the CURRENT row state at the moment this runs.
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; OR: ({ runningSince: null } | { runningSince: { lt: Date } })[] };
        data: Partial<LockRow>;
      }) => {
        const row = rows.get(where.id);
        if (!row) return { count: 0 };
        const matches = where.OR.some((cond) => {
          if ("runningSince" in cond && cond.runningSince === null) return row.runningSince === null;
          const lt = (cond as { runningSince: { lt: Date } }).runningSince.lt;
          return row.runningSince !== null && row.runningSince < lt;
        });
        if (!matches) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<LockRow> }) => {
        const row = rows.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  },
}));

const { acquireIngestionLock, releaseIngestionLock } = await import("./lock");

describe("ingestion lock", () => {
  beforeEach(() => {
    rows = new Map();
  });

  it("acquires the lock when unlocked", async () => {
    expect(await acquireIngestionLock("cron")).toBe(true);
    expect(rows.get("singleton")!.runningSince).not.toBeNull();
  });

  it("refuses a second acquire while already locked — the concurrent-run case", async () => {
    expect(await acquireIngestionLock("run-a")).toBe(true);
    expect(await acquireIngestionLock("run-b")).toBe(false);
  });

  it("allows acquiring again after release", async () => {
    await acquireIngestionLock("run-a");
    await releaseIngestionLock();
    expect(await acquireIngestionLock("run-b")).toBe(true);
  });

  it("treats a stale lock (crashed run that never released) as re-acquirable", async () => {
    await acquireIngestionLock("crashed-run");
    // Simulate time passing well past the staleness threshold without a release.
    rows.get("singleton")!.runningSince = new Date(Date.now() - 3 * 60 * 1000);
    expect(await acquireIngestionLock("recovery-run")).toBe(true);
  });

  it("does not treat a fresh lock as stale", async () => {
    await acquireIngestionLock("run-a");
    expect(await acquireIngestionLock("run-b")).toBe(false);
  });

  it("allows the market-data and filing workers to use independent locks", async () => {
    expect(await acquireIngestionLock("market-run")).toBe(true);
    expect(await acquireIngestionLock("filing-run", "filing-evidence")).toBe(true);
    expect(await acquireIngestionLock("second-filing-run", "filing-evidence")).toBe(false);
    await releaseIngestionLock("filing-evidence");
    expect(await acquireIngestionLock("second-filing-run", "filing-evidence")).toBe(true);
  });
});
