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
});
