import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheAllotmentResult, loadAllotmentCache } from "@/src/lib/allotment-store";
import type { AllotmentResult } from "@/src/lib/allotment";

const secureStore = new Map<string, string>();

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value);
  }),
}));

function makeResult(pan: string, status: AllotmentResult["status"]): AllotmentResult {
  return {
    pan,
    companyName: "Behari Lal Engineering Limited - IPO",
    registrar: "MUFG Intime India Private Limited",
    status,
    checkedAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("allotment cache (per-IPO SecureStore keys)", () => {
  beforeEach(() => {
    secureStore.clear();
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

  it("keeps each IPO's entry small (well under iOS 2048-byte SecureStore limit)", async () => {
    for (let i = 0; i < 5; i++) {
      await cacheAllotmentResult("ipo-1", makeResult(`PAN${String(i).padStart(4, "0")}H`, i % 2 ? "ALLOTTED" : "NOT_ALLOTTED"));
    }
    const entry = secureStore.get("ipobharosa.allotment.ipo-1") ?? "";
    expect(entry.length).toBeLessThan(2048);
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

  it("survives an in-memory reload by re-reading SecureStore", async () => {
    await cacheAllotmentResult("ipo-1", makeResult("HFQPK9233H", "ALLOTTED"));
    expect((await loadAllotmentCache())["ipo-1"]["HFQPK9233H"].status).toBe("ALLOTTED");
  });
});