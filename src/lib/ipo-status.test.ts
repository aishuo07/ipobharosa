import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeIpo = {
  id: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
  openDate: Date;
  closeDate: Date;
  company: { name: string };
};

let store: FakeIpo[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ipo: {
      findMany: async ({ where }: { where: { status: string; openDate?: { lte: Date }; closeDate?: { lte: Date } } }) =>
        store.filter((ipo) => {
          if (ipo.status !== where.status) return false;
          if (where.openDate && !(ipo.openDate <= where.openDate.lte)) return false;
          if (where.closeDate && !(ipo.closeDate <= where.closeDate.lte)) return false;
          return true;
        }),
      update: async ({ where, data }: { where: { id: string }; data: { status: FakeIpo["status"] } }) => {
        const ipo = store.find((i) => i.id === where.id);
        if (ipo) ipo.status = data.status;
      },
    },
  },
}));

const { syncIpoStatuses } = await import("./ipo-status");

function makeIpo(overrides: Partial<FakeIpo> & { id: string }): FakeIpo {
  return {
    status: "UPCOMING",
    openDate: new Date("2026-08-01"),
    closeDate: new Date("2026-08-05"),
    company: { name: "Test Co" },
    ...overrides,
  };
}

describe("syncIpoStatuses idempotency", () => {
  beforeEach(() => {
    store = [];
  });

  it("transitions an IPO whose open date has passed, exactly once across repeated calls", async () => {
    store.push(makeIpo({ id: "1", status: "UPCOMING", openDate: new Date("2026-08-01") }));
    const now = new Date("2026-08-02");

    const first = await syncIpoStatuses(now);
    expect(first).toEqual([{ ipoId: "1", companyName: "Test Co", from: "UPCOMING", to: "OPEN" }]);
    expect(store[0].status).toBe("OPEN");

    const second = await syncIpoStatuses(now);
    expect(second).toEqual([]);
    expect(store[0].status).toBe("OPEN");
  });

  it("does not transition an IPO whose open date is still in the future", async () => {
    store.push(makeIpo({ id: "1", status: "UPCOMING", openDate: new Date("2026-09-01") }));
    const now = new Date("2026-08-02");

    const result = await syncIpoStatuses(now);
    expect(result).toEqual([]);
    expect(store[0].status).toBe("UPCOMING");
  });

  it("carries an IPO through UPCOMING -> OPEN -> CLOSED across separate calls without double-firing either transition", async () => {
    store.push(
      makeIpo({
        id: "1",
        status: "UPCOMING",
        openDate: new Date("2026-08-01"),
        closeDate: new Date("2026-08-05"),
      }),
    );

    const afterOpen = await syncIpoStatuses(new Date("2026-08-02"));
    expect(afterOpen).toEqual([{ ipoId: "1", companyName: "Test Co", from: "UPCOMING", to: "OPEN" }]);

    // Re-running at the same point in time again must not re-fire the OPEN transition.
    const repeatSameInstant = await syncIpoStatuses(new Date("2026-08-02"));
    expect(repeatSameInstant).toEqual([]);

    const afterClose = await syncIpoStatuses(new Date("2026-08-06"));
    expect(afterClose).toEqual([{ ipoId: "1", companyName: "Test Co", from: "OPEN", to: "CLOSED" }]);
    expect(store[0].status).toBe("CLOSED");

    const repeatAfterClose = await syncIpoStatuses(new Date("2026-08-06"));
    expect(repeatAfterClose).toEqual([]);
  });

  it("never touches LISTED IPOs — CLOSED -> LISTED stays manual", async () => {
    store.push(
      makeIpo({
        id: "1",
        status: "CLOSED",
        openDate: new Date("2026-08-01"),
        closeDate: new Date("2026-08-05"),
      }),
    );

    const result = await syncIpoStatuses(new Date("2030-01-01"));
    expect(result).toEqual([]);
    expect(store[0].status).toBe("CLOSED");
  });

  it("handles multiple eligible IPOs in one cycle independently", async () => {
    store.push(
      makeIpo({ id: "1", status: "UPCOMING", openDate: new Date("2026-08-01"), company: { name: "Alpha" } }),
      makeIpo({ id: "2", status: "UPCOMING", openDate: new Date("2026-08-01"), company: { name: "Beta" } }),
      makeIpo({ id: "3", status: "UPCOMING", openDate: new Date("2027-01-01"), company: { name: "Gamma" } }),
    );

    const result = await syncIpoStatuses(new Date("2026-08-02"));
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.companyName).sort()).toEqual(["Alpha", "Beta"]);
    expect(store.find((i) => i.id === "3")!.status).toBe("UPCOMING");
  });
});
