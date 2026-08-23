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

  Sentry.addBreadcrumb({
    category: "pipeline",
    message: `Starting ${operation}`,
    level: "info",
    data: { operation },
  });

  try {
    const result = await run();
    const durationMs = Date.now() - started;

    if (dsn) {
      Sentry.captureMessage(`pipeline:${operation}:ok`, {
        level: "info",
        tags: { pipeline: operation, status: "ok" },
        extra: { operation, durationMs, result: result ?? {} },
      });
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - started;

    if (dsn) {
      Sentry.captureException(error, {
        tags: { pipeline: operation, status: "error" },
        extra: { durationMs, operation },
      });
    }
    throw error;
  }
}
