import { prisma } from "@/lib/prisma";

type RetryPolicy = {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
  jitterRatio: number;
  sleep: (delayMs: number) => Promise<void>;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseMs: 250,
  maxMs: 2_000,
  jitterRatio: 0.2,
  sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
};

export function computeRetryDelayMs(
  attempt: number,
  policy: Pick<RetryPolicy, "baseMs" | "maxMs" | "jitterRatio"> = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = exponential * policy.jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

export function isTransientSourceError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/timeout|timed out|abort|econnreset|econnrefused|enotfound|fetch failed|socket|tls/i.test(message)) return true;
  const status = Number(message.match(/HTTP\s+(\d{3})/i)?.[1]);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function withTransientRetries<T>(
  operation: () => Promise<T>,
  overrides: Partial<RetryPolicy> = {},
): Promise<T> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...overrides };
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === policy.maxAttempts || !isTransientSourceError(error)) throw error;
      await policy.sleep(computeRetryDelayMs(attempt, policy));
    }
  }
  throw lastError;
}

function persistedRetryDelayMs(consecutiveFailures: number): number {
  const base = 15 * 60 * 1_000;
  return Math.min(24 * 60 * 60 * 1_000, base * 2 ** Math.max(0, consecutiveFailures - 1));
}

export async function recordSourceSuccess(key: string, source: string, operation: string, at = new Date()): Promise<void> {
  await prisma.sourceOperationHealth.upsert({
    where: { key },
    create: { key, source, operation, lastAttemptAt: at, lastSuccessAt: at },
    update: {
      source,
      operation,
      lastAttemptAt: at,
      lastSuccessAt: at,
      consecutiveFailures: 0,
      nextRetryAt: null,
      lastError: null,
    },
  });
}

export async function recordSourceFailure(
  key: string,
  source: string,
  operation: string,
  error: unknown,
  at = new Date(),
): Promise<Date> {
  const existing = await prisma.sourceOperationHealth.findUnique({ where: { key }, select: { consecutiveFailures: true } });
  const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
  const nextRetryAt = new Date(at.getTime() + persistedRetryDelayMs(consecutiveFailures));
  const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  await prisma.sourceOperationHealth.upsert({
    where: { key },
    create: {
      key,
      source,
      operation,
      lastAttemptAt: at,
      lastFailureAt: at,
      consecutiveFailures,
      nextRetryAt,
      lastError,
    },
    update: {
      source,
      operation,
      lastAttemptAt: at,
      lastFailureAt: at,
      consecutiveFailures,
      nextRetryAt,
      lastError,
    },
  });
  return nextRetryAt;
}
