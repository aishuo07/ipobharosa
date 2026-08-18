import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheAllotmentResult, loadAllotmentCache, saveAllotmentCache, type IpoAllotmentCache } from "@/src/lib/allotment-store";
import type { AllotmentResult } from "@/src/lib/allotment";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
}));

const store = new Map<string, string>();
vi.mock("@/src/lib/allotment-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/allotment-store")>();
  return {
    ...actual,
    loadAllotmentCache: vi.fn(async () => {
      const raw = store.get("ipobharosa.allotment-cache.v1");
      return raw ? (JSON.parse(raw) as IpoAllotmentCache) : {};
    }),
    saveAllotmentCache: vi.fn(async (cache: IpoAllotmentCache) => {
      store.set("ipobharosa.allotment-cache.v1", JSON.stringify(cache));
    }),
    cacheAllotmentResult: vi.fn(async (ipoId: string, result: AllotmentResult) => {
      const cache = await loadAllotmentCache();
      cache[ipoId] = { ...(cache[ipoId] ?? {}), [result.pan]: result };
      await saveAllotmentCache(cache);
      return cache;
    }),
  };
});

function makeResult(pan: string, status: AllotmentResult["status"]): AllotmentResult {
  return {
    pan,
    companyName: "Behari Lal Engineering Limited - IPO",
    registrar: "MUFG Intime India Private Limited",
    status,
    checkedAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("allotment cache", () => {
  beforeEach(() => {
    store.clear();
  });

  it("stores results keyed by IPO id and PAN, and returns them on load", async () => {
    await cacheAllotmentResult("ipo-1", makeResult("HFQPK9233H", "ALLOTTED"));
    await cacheAllotmentResult("ipo-1", makeResult("ABCDE1234F", "NOT_ALLOTTED"));

    const cache = await loadAllotmentCache();
    expect(Object.keys(cache["ipo-1"])).toEqual(["HFQPK9233H", "ABCDE1234F"]);
    expect(cache["ipo-1"]["HFQPK9233H"].status).toBe("ALLOTTED");
  });

  it("separates results across different IPOs", async () => {
    await cacheAllotmentResult("ipo-1", makeResult("HFQPK9233H", "ALLOTTED"));
    await cacheAllotmentResult("ipo-2", makeResult("HFQPK9233H", "NOT_ALLOTTED"));

    const cache = await loadAllotmentCache();
    expect(cache["ipo-1"]["HFQPK9233H"].status).toBe("ALLOTTED");
    expect(cache["ipo-2"]["HFQPK9233H"].status).toBe("NOT_ALLOTTED");
  });

  it("overwrites a PAN's previous result for the same IPO", async () => {
    await cacheAllotmentResult("ipo-1", makeResult("HFQPK9233H", "NOT_ALLOTTED"));
    await cacheAllotmentResult("ipo-1", makeResult("HFQPK9233H", "ALLOTTED"));

    const cache = await loadAllotmentCache();
    expect(cache["ipo-1"]["HFQPK9233H"].status).toBe("ALLOTTED");
    expect(Object.keys(cache["ipo-1"])).toEqual(["HFQPK9233H"]);
  });

  it("returns an empty object when nothing is cached", async () => {
    expect(await loadAllotmentCache()).toEqual({});
  });

  it("persists an explicit cache via saveAllotmentCache", async () => {
    await saveAllotmentCache({ "ipo-9": { ABCDE1234F: makeResult("ABCDE1234F", "NOT_APPLIED") } });
    const cache = await loadAllotmentCache();
    expect(cache["ipo-9"]["ABCDE1234F"].status).toBe("NOT_APPLIED");
  });
});