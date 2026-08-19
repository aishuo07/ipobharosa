import * as Sentry from "@sentry/nextjs";

/**
 * Lightweight Sentry wrapper for pipeline runs (ingestion, allotment check,
 * daily push, filing evidence). Every cron reports its outcome + duration so
 * the Sentry dashboard shows pipeline health at a glance. No-op when the DSN
 * is not configured.
 */

export async function monitorPipeline(
  operation: string,
  run: () => Promise<Record<string, unknown> | undefined>,
): Promise<Record<string, unknown> | undefined> {
  const dsn = process.env.SENTRY_DSN;
  const started = Date.now();

  try {
    const result = await run();
    if (dsn) {
      Sentry.captureMessage(`pipeline:${operation}:ok`, {
        level: "info",
        extra: { operation, durationMs: Date.now() - started, result: result ?? {} },
      });
    }
    return result;
  } catch (error) {
    if (dsn) {
      Sentry.captureException(error, {
        tags: { pipeline: operation },
        extra: { durationMs: Date.now() - started },
      });
    }
    throw error;
  }
}