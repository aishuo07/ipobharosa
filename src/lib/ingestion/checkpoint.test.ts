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

  it("adds filing evidence counters when restoring a pre-filings checkpoint", () => {
    const saved = initialCheckpoint();
    const summary = { ...saved.summary } as typeof saved.summary & { filings?: never };
    delete (summary as unknown as Record<string, unknown>).filings;
    expect(readCheckpoint({ ...saved, summary }).summary.filings).toEqual({ captured: 0, skipped: 0, failed: [] });
  });

  it("adds revalidation counters when restoring an older checkpoint", () => {
    const saved = initialCheckpoint();
    const summary = { ...saved.summary } as typeof saved.summary & { revalidation?: never };
    delete (summary as unknown as Record<string, unknown>).revalidation;
    expect(readCheckpoint({ ...saved, summary }).summary.revalidation).toEqual({
      target: 0,
      checked: 0,
      published: 0,
      eligibleHeld: 0,
      retries: 0,
      exceptions: 0,
      invalid: 0,
    });
  });

  it("adds published revalidation counters when restoring an older checkpoint", () => {
    const saved = initialCheckpoint();
    const summary = { ...saved.summary } as typeof saved.summary & { publishedRevalidation?: never };
    delete (summary as unknown as Record<string, unknown>).publishedRevalidation;
    expect(readCheckpoint({ ...saved, summary }).summary.publishedRevalidation).toEqual({
      target: 0,
      checked: 0,
      matched: 0,
      drifts: 0,
      retries: 0,
      invalid: 0,
    });
  });
});
