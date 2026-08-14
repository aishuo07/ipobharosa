import type { IngestionSummary } from "./run-cycle";

/**
 * Pure decision logic for "does this run deserve a heads-up email" —
 * kept separate from the sending mechanics so it's cheap to test every
 * branch without touching Resend or the database.
 */
export function computeAlertReasons(summary: IngestionSummary): string[] {
  const reasons: string[] = [];

  if ("error" in summary.discovery) {
    reasons.push(`Discovery crashed entirely: ${summary.discovery.error}`);
  } else {
    if (summary.discovery.dbErrors.length > 0) {
      reasons.push(`${summary.discovery.dbErrors.length} discovery database write failure(s)`);
    }
    if (summary.discovery.queueCapped) {
      reasons.push("Draft/quarantine review queue is at capacity — new candidates are being skipped");
    }
  }
  if (summary.filings.failed.length > 0) {
    reasons.push(`${summary.filings.failed.length} filing evidence capture failure(s)`);
  }
  if (summary.catalogue.error) {
    reasons.push(`Official filing catalogue refresh failed: ${summary.catalogue.error}`);
  }
  if ((summary.publishedRevalidation?.drifts ?? 0) > 0) {
    reasons.push(`${summary.publishedRevalidation.drifts} published IPO source drift(s) detected — public values were not changed`);
  }
  if ((summary.publishedRevalidation?.invalid ?? 0) > 0) {
    reasons.push(`${summary.publishedRevalidation.invalid} published IPO record(s) are missing required core facts`);
  }

  const sourceEntries = Object.entries(summary.perSource);
  const allSourcesDown = sourceEntries.length > 0 && sourceEntries.every(([, s]) => s.success === 0 && s.failure > 0);
  if (allSourcesDown) {
    reasons.push("Every GMP source failed this cycle");
  }

  if (summary.reminders.failed > 0) {
    reasons.push(`${summary.reminders.failed} reminder email(s) failed to send`);
  }

  return reasons;
}
