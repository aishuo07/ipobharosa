import { describe, expect, it } from "vitest";
import { initialCheckpoint, readCheckpoint } from "./run-cycle";

describe("ingestion checkpoint", () => {
  it("starts at the prepare stage with a zero cursor", () => {
    expect(initialCheckpoint()).toMatchObject({ stage: "prepare", cursor: 0, attempts: 0, lastError: null });
  });

  it("restores a persisted failed batch without advancing its cursor", () => {
    const saved = { ...initialCheckpoint(), stage: "gmp" as const, cursor: 6, attempts: 3, lastError: "source timeout" };
    expect(readCheckpoint(saved)).toEqual(saved);
  });

  it("rejects incompatible checkpoint shapes safely", () => {
    expect(readCheckpoint({ version: 99, stage: "gmp" })).toEqual(initialCheckpoint());
  });
});
