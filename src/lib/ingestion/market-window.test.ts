import { describe, expect, it } from "vitest";
import { marketFinalizationCutoff } from "./market-window";

describe("market signal finalization window", () => {
  it("stops polling closed IPOs two days after the listing/finalisation window", () => {
    expect(marketFinalizationCutoff(new Date("2026-08-17T12:00:00.000Z")).toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });
});
