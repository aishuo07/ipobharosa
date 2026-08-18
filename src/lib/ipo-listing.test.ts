import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeIpo = {
  id: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
  openDate: Date;
  closeDate: Date;
  listingDate: Date | null;
  listingPrice: number | null;
  company: { name: string };
};

let store: FakeIpo[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ipo: {
      findMany: async ({ where }: { where: { status: string; listingDate?: { lte: Date } } }) =>
        store.filter((ipo) => {
          if (ipo.status !== where.status) return false;
          if (where.listingDate && (!ipo.listingDate || !(ipo.listingDate <= where.listingDate.lte))) return false;
          return true;
        }),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: FakeIpo["status"]; listingPrice?: number; listingDate?: Date };
      }) => {
        const ipo = store.find((i) => i.id === where.id);
        if (!ipo) return;
        if (data.status) ipo.status = data.status;
        if (data.listingPrice !== undefined) ipo.listingPrice = data.listingPrice;
        if (data.listingDate) ipo.listingDate = data.listingDate;
      },
    },
  },
}));

const { syncIpoListings } = await import("./ipo-listing");

function makeIpo(overrides: Partial<FakeIpo> & { id: string }): FakeIpo {
  return {
    status: "CLOSED",
    openDate: new Date("2026-08-01"),
    closeDate: new Date("2026-08-05"),
    listingDate: new Date("2026-08-18"),
    listingPrice: null,
    company: { name: "Test Co" },
    ...overrides,
  };
}

function listingSource(listings: Record<string, { listingPrice: number; listingDate: Date } | null>) {
  return {
    findListing: vi.fn(async (companyName: string) => listings[companyName] ?? null),
  };
}

describe("syncIpoListings", () => {
  beforeEach(() => {
    store = [];
  });

  it("finishes CLOSED -> LISTED with the real NSE listing price once published", async () => {
    store.push(makeIpo({ id: "1", company: { name: "Milky Mist Dairy Food Limited" } }));
    const source = listingSource({
      "Milky Mist Dairy Food Limited": { listingPrice: 140, listingDate: new Date("2026-08-18") },
    });

    const result = await syncIpoListings(new Date("2026-08-19"), source);
    expect(result).toEqual([
      { ipoId: "1", companyName: "Milky Mist Dairy Food Limited", from: "CLOSED", to: "LISTED", listingPrice: 140 },
    ]);
    expect(store[0].status).toBe("LISTED");
    expect(store[0].listingPrice).toBe(140);
  });

  it("does not list an IPO before its listing date", async () => {
    store.push(makeIpo({ id: "1", listingDate: new Date("2026-08-18") }));
    const source = listingSource({
      "Test Co": { listingPrice: 140, listingDate: new Date("2026-08-18") },
    });

    const result = await syncIpoListings(new Date("2026-08-17"), source);
    expect(result).toEqual([]);
    expect(store[0].status).toBe("CLOSED");
  });

  it("skips IPOs NSE has not listed yet (no real price published)", async () => {
    store.push(makeIpo({ id: "1", company: { name: "Credent Connect N Care Limited" } }));
    const source = listingSource({ "Credent Connect N Care Limited": null });

    const result = await syncIpoListings(new Date("2026-08-19"), source);
    expect(result).toEqual([]);
    expect(store[0].status).toBe("CLOSED");
    expect(store[0].listingPrice).toBeNull();
  });

  it("keeps going after a source failure instead of dropping the whole batch", async () => {
    store.push(
      makeIpo({ id: "1", company: { name: "Alpha" } }),
      makeIpo({ id: "2", company: { name: "Beta" } }),
    );
    const source = {
      findListing: vi.fn(async (companyName: string) => {
        if (companyName === "Alpha") throw new Error("NSE down");
        return { listingPrice: 33, listingDate: new Date("2026-08-18") };
      }),
    };

    const result = await syncIpoListings(new Date("2026-08-19"), source);
    expect(result).toEqual([{ ipoId: "2", companyName: "Beta", from: "CLOSED", to: "LISTED", listingPrice: 33 }]);
    expect(store[0].status).toBe("CLOSED");
    expect(store[1].status).toBe("LISTED");
  });
});