import { describe, expect, it } from "vitest";
import { providerErrorResult, providerResultMessage } from "./provider-result";

describe("provider result classification", () => {
  it("classifies timeouts and server failures as retryable", () => {
    expect(providerErrorResult(new Error("request timeout"))).toMatchObject({ kind: "ERROR", category: "timeout", retryable: true });
    expect(providerErrorResult(new Error("source HTTP 503"))).toMatchObject({ kind: "ERROR", category: "http", retryable: true });
  });

  it("keeps parser failures non-retryable and serializes expected absence separately", () => {
    expect(providerErrorResult(new Error("could not parse source table"))).toMatchObject({ kind: "ERROR", category: "parse", retryable: false });
    expect(providerResultMessage({ kind: "NOT_COVERED", reason: "no IPO row" })).toBe("[NOT_COVERED] no IPO row");
  });
});
