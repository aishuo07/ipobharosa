export type ProviderErrorCategory = "timeout" | "http" | "parse" | "unknown";

export type ProviderResult<T> =
  | { kind: "VALUE"; value: T }
  | { kind: "NOT_YET_AVAILABLE"; reason: string }
  | { kind: "NOT_COVERED"; reason: string }
  | { kind: "ERROR"; category: ProviderErrorCategory; retryable: boolean; reason: string };

export function providerErrorResult(error: unknown): ProviderResult<never> {
  const reason = error instanceof Error ? error.message : String(error);
  const status = Number(reason.match(/HTTP\s+(\d{3})/i)?.[1]);
  const timedOut = /timeout|timed out|abort|econnreset|econnrefused|enotfound|fetch failed|socket|tls/i.test(reason);
  const retryableStatus = status === 408 || status === 425 || status === 429 || status >= 500;
  return {
    kind: "ERROR",
    category: timedOut ? "timeout" : Number.isFinite(status) ? "http" : /parse|selector|markup|attribute|table|numeric/i.test(reason) ? "parse" : "unknown",
    retryable: timedOut || retryableStatus,
    reason: reason.slice(0, 1_000),
  };
}

export function providerResultMessage<T>(result: Exclude<ProviderResult<T>, { kind: "VALUE" }>): string {
  return result.kind === "ERROR"
    ? `[ERROR:${result.category}] ${result.reason}`
    : `[${result.kind}] ${result.reason}`;
}
