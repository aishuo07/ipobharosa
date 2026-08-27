import { describe, expect, it } from "vitest";
import { deriveGmpAvailability } from "./market-signal";

const at = new Date("2026-08-17T10:00:00.000Z");

describe("public GMP availability", () => {
  it("distinguishes not published, non-coverage and real source errors", () => {
    expect(deriveGmpAvailability([{ sourceKey: "a", success: false, errorMessage: "[NOT_YET_AVAILABLE] blank quote", capturedAt: at }]).kind).toBe("NOT_YET_AVAILABLE");
    expect(deriveGmpAvailability([{ sourceKey: "a", success: false, errorMessage: "[NOT_COVERED] no row", capturedAt: at }]).kind).toBe("NOT_COVERED");
    expect(deriveGmpAvailability([{ sourceKey: "a", success: false, errorMessage: "[ERROR:http] HTTP 503", capturedAt: at }]).kind).toBe("ERROR");
  });

  it("uses only the latest attempt per source", () => {
    const result = deriveGmpAvailability([
      { sourceKey: "a", success: false, errorMessage: "[NOT_COVERED] no row", capturedAt: at },
      { sourceKey: "a", success: true, errorMessage: null, capturedAt: new Date(at.getTime() - 60_000) },
    ]);
    expect(result.kind).toBe("NOT_COVERED");
    expect(result.checkedSources).toBe(1);
  });
});
