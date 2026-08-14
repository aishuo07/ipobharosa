import { describe, expect, it, vi } from "vitest";
import { computeRetryDelayMs, isTransientSourceError, withTransientRetries } from "./source-operation";

describe("source operation retry policy", () => {
  it("uses capped exponential backoff", () => {
    expect(computeRetryDelayMs(1, { baseMs: 100, maxMs: 1_000, jitterRatio: 0 }, () => 0.5)).toBe(100);
    expect(computeRetryDelayMs(4, { baseMs: 100, maxMs: 1_000, jitterRatio: 0 }, () => 0.5)).toBe(800);
    expect(computeRetryDelayMs(9, { baseMs: 100, maxMs: 1_000, jitterRatio: 0 }, () => 0.5)).toBe(1_000);
  });

  it("retries timeouts, rate limits and server failures but not permanent 4xx errors", () => {
    expect(isTransientSourceError(new Error("NSE HTTP 429"))).toBe(true);
    expect(isTransientSourceError(new Error("SEBI HTTP 503"))).toBe(true);
    expect(isTransientSourceError(new Error("The operation was aborted due to timeout"))).toBe(true);
    expect(isTransientSourceError(new Error("NSE HTTP 404"))).toBe(false);
  });

  it("retries a transient operation and returns the eventual result", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("NSE HTTP 503"))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withTransientRetries(operation, { maxAttempts: 3, baseMs: 10, sleep, jitterRatio: 0 })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("does not retry a permanent failure", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("NSE HTTP 404"));
    const sleep = vi.fn();

    await expect(withTransientRetries(operation, { maxAttempts: 3, sleep })).rejects.toThrow("HTTP 404");
    expect(operation).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});
