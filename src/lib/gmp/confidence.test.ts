import { describe, expect, it } from "vitest";
import { computeGmpSnapshot } from "./confidence";

describe("computeGmpSnapshot", () => {
  it("returns HIGH confidence when 3+ sources agree closely", () => {
    const result = computeGmpSnapshot([84, 86, 88]);
    expect(result).not.toBeNull();
    expect(result!.medianValue).toBe(86);
    expect(result!.sourceCount).toBe(3);
    expect(result!.confidence).toBe("HIGH");
  });

  it("degrades to MEDIUM confidence, not failure, when one of three sources drops out", () => {
    // Same two surviving values as above, one source (the 88) failed this cycle.
    const result = computeGmpSnapshot([84, 86]);
    expect(result).not.toBeNull();
    expect(result!.sourceCount).toBe(2);
    expect(result!.confidence).toBe("MEDIUM");
  });

  it("returns LOW confidence with only a single surviving source", () => {
    const result = computeGmpSnapshot([84]);
    expect(result).not.toBeNull();
    expect(result!.sourceCount).toBe(1);
    expect(result!.maxDeviation).toBe(0);
    expect(result!.confidence).toBe("LOW");
  });

  it("returns LOW confidence when sources disagree widely, even with a full source count", () => {
    const result = computeGmpSnapshot([50, 90, 130]);
    expect(result).not.toBeNull();
    expect(result!.sourceCount).toBe(3);
    expect(result!.confidence).toBe("LOW");
  });

  it("returns null when every source fails this cycle, instead of inventing a value", () => {
    const result = computeGmpSnapshot([]);
    expect(result).toBeNull();
  });

  it("handles an even number of surviving sources for the median", () => {
    const result = computeGmpSnapshot([80, 90, 100, 110]);
    expect(result).not.toBeNull();
    expect(result!.medianValue).toBe(95);
  });

  it("is idempotent — the same input always yields the same result and is left unmutated", () => {
    const input = [130, 84, 90];
    const first = computeGmpSnapshot(input);
    const second = computeGmpSnapshot(input);
    expect(first).toEqual(second);
    expect(input).toEqual([130, 84, 90]);
  });

  it("handles negative GMP values (a stock expected to list below issue price)", () => {
    const result = computeGmpSnapshot([-5, -8, -6]);
    expect(result).not.toBeNull();
    expect(result!.medianValue).toBe(-6);
    expect(result!.confidence).toBe("HIGH");
  });

  it("has zero spread and HIGH confidence when every source reports an identical value", () => {
    const result = computeGmpSnapshot([100, 100, 100]);
    expect(result!.maxDeviation).toBe(0);
    expect(result!.confidence).toBe("HIGH");
  });

  it("stays HIGH exactly at the 8% spread boundary with 3+ sources", () => {
    // median 100, deviation 8 -> spreadPct exactly 0.08
    const result = computeGmpSnapshot([92, 100, 108]);
    expect(result!.medianValue).toBe(100);
    expect(result!.maxDeviation).toBe(8);
    expect(result!.confidence).toBe("HIGH");
  });

  it("drops to MEDIUM just past the 8% spread boundary with 3+ sources", () => {
    const result = computeGmpSnapshot([91, 100, 109]);
    expect(result!.confidence).toBe("MEDIUM");
  });

  it("stays MEDIUM exactly at the 20% spread boundary with 2+ sources", () => {
    // 2-source median is the average of both values, so median 100 with
    // deviation 20 requires the pair (80, 120) -> spreadPct exactly 0.20
    const result = computeGmpSnapshot([80, 120]);
    expect(result!.medianValue).toBe(100);
    expect(result!.maxDeviation).toBe(20);
    expect(result!.confidence).toBe("MEDIUM");
  });

  it("drops to LOW just past the 20% spread boundary with 2 sources", () => {
    const result = computeGmpSnapshot([79, 121]);
    expect(result!.confidence).toBe("LOW");
  });

  it("treats a median of exactly zero without dividing by zero", () => {
    const result = computeGmpSnapshot([-5, 0, 5]);
    expect(result!.medianValue).toBe(0);
    // spreadPct is defined as 0 when medianValue is 0, regardless of maxDeviation
    expect(result!.confidence).toBe("HIGH");
  });
});
