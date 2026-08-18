import { describe, expect, it } from "vitest";
import type { GmpAdapter } from "@/lib/gmp/types";
import { enabledGmpAdapters, isGmpSourceEnabled, sourcePolicyFor } from "./source-policy";

const adapters = ["ipowatch", "sahi", "ipoji", "investorgain", "ipotrack"].map((key) => ({
  key,
  name: key,
  fetchGmp: async () => ({ kind: "NOT_COVERED" as const, reason: "fixture" }),
})) satisfies GmpAdapter[];

describe("launch source policy", () => {
  it("hard-disables IPOWatch and Sahi even when requested in the allowlist", () => {
    expect(enabledGmpAdapters(adapters, "ipowatch,sahi,ipoji").map((adapter) => adapter.key)).toEqual(["ipoji"]);
  });

  it("enables no unofficial GMP provider without an explicit allowlist", () => {
    expect(enabledGmpAdapters(adapters, "")).toEqual([]);
  });

  it("allows only configured providers whose use is not hard-blocked", () => {
    expect(enabledGmpAdapters(adapters, "investorgain, ipoji, ipotrack").map((adapter) => adapter.key)).toEqual([
      "ipoji",
      "investorgain",
      "ipotrack",
    ]);
  });

  it("records an exact disabled-policy reason", () => {
    expect(sourcePolicyFor("ipowatch")).toMatchObject({ productionEnabled: false, status: "TERMS_CONFLICT" });
    expect(sourcePolicyFor("sahi")).toMatchObject({ productionEnabled: false, status: "PERMISSION_REQUIRED" });
  });

  it("never treats historical hard-blocked observations as current GMP", () => {
    expect(isGmpSourceEnabled("ipowatch", "ipowatch")).toBe(false);
    expect(isGmpSourceEnabled("sahi", "sahi")).toBe(false);
    expect(isGmpSourceEnabled("ipoji", "ipoji")).toBe(true);
  });
});
