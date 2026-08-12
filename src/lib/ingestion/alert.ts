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
