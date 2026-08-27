import { describe, expect, it } from "vitest";
import { collectObservations, successfulValues } from "./ingest";
import { computeGmpSnapshot } from "./confidence";
import type { GmpAdapter } from "./types";

function fakeAdapter(key: string, behavior: number | Error): GmpAdapter {
  return {
    key,
    name: key,
    fetchGmp: async () => {
      if (behavior instanceof Error) throw behavior;
      return { kind: "VALUE", value: behavior };
    },
  };
}

describe("collectObservations", () => {
  it("records a success observation per adapter when all succeed", async () => {
    const adapters = [
      fakeAdapter("investorgain", 84),
      fakeAdapter("ipocentral", 86),
      fakeAdapter("ipowatch", 88),
    ];

    const observations = await collectObservations("Vahana Mobility", adapters);

    expect(observations).toHaveLength(3);
    expect(observations.every((o) => o.kind === "VALUE")).toBe(true);
    expect(successfulValues(observations)).toEqual([84, 86, 88]);
  });

  it("isolates a failing source instead of failing the whole cycle", async () => {
    const adapters = [
      fakeAdapter("investorgain", 84),
      fakeAdapter("ipocentral", new Error("layout changed, selector not found")),
      fakeAdapter("ipowatch", 88),
    ];

    const observations = await collectObservations("Vahana Mobility", adapters);

    expect(observations).toHaveLength(3);
    const failed = observations.find((o) => o.sourceKey === "ipocentral");
    expect(failed?.kind).toBe("ERROR");
    if (failed?.kind === "ERROR") {
      expect(failed.reason).toContain("layout changed");
    }
    expect(successfulValues(observations)).toEqual([84, 88]);
  });

  it("feeds a real fallback end-to-end: one source down still yields a snapshot with degraded confidence", async () => {
    const adapters = [
      fakeAdapter("investorgain", 84),
      fakeAdapter("ipocentral", new Error("timeout")),
      fakeAdapter("ipowatch", 88),
    ];

    const observations = await collectObservations("Vahana Mobility", adapters);
    const snapshot = computeGmpSnapshot(successfulValues(observations));

    expect(snapshot).not.toBeNull();
    expect(snapshot!.sourceCount).toBe(2);
    expect(snapshot!.confidence).toBe("MEDIUM");
  });

  it("yields no snapshot when every source fails, rather than inventing one", async () => {
    const adapters = [
      fakeAdapter("investorgain", new Error("timeout")),
      fakeAdapter("ipocentral", new Error("blocked")),
    ];

    const observations = await collectObservations("Vahana Mobility", adapters);
    const snapshot = computeGmpSnapshot(successfulValues(observations));

    expect(observations.every((o) => o.kind === "ERROR")).toBe(true);
    expect(snapshot).toBeNull();
  });

  it("keeps non-coverage and not-yet-published quotes out of outage errors", async () => {
    const adapters: GmpAdapter[] = [
      { key: "a", name: "A", fetchGmp: async () => ({ kind: "NOT_COVERED", reason: "no row" }) },
      { key: "b", name: "B", fetchGmp: async () => ({ kind: "NOT_YET_AVAILABLE", reason: "quote is blank" }) },
    ];
    const observations = await collectObservations("Example", adapters);
    expect(observations.map((value) => value.kind)).toEqual(["NOT_COVERED", "NOT_YET_AVAILABLE"]);
    expect(successfulValues(observations)).toEqual([]);
  });
});
