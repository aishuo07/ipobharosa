import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/resend";
import type { StatusTransition } from "@/lib/ipo-status";
import { getEmailReadiness } from "@/lib/email/readiness";
import { resolveSiteUrl } from "@/lib/site-url";
import { toIpoSlug } from "@/lib/ipo-slug";

const SITE_URL = resolveSiteUrl();
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

const TEMPLATES: Record<string, (companyName: string) => { subject: string; body: string }> = {
  "UPCOMING->OPEN": (name) => ({
    subject: `${name} IPO is now open for bidding`,
    body: `${name}'s IPO just opened for subscription. Check the price band, lot size, and current GMP before it closes.`,
  }),
  "OPEN->CLOSED": (name) => ({
    subject: `${name} IPO has closed`,
    body: `${name}'s IPO bidding window just closed. Allotment is next — we'll email you again once that's finalized.`,
  }),
  "CLOSED->LISTED": (name) => ({
    subject: `${name} has listed on the exchange`,
    body: `${name} has listed. Check its listing price and how it compares to the IPO price band on IPOBharosa.`,
  }),
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ReminderSummary = { sent: number; failed: number; skipped: number };

/**
 * Watchlisting an IPO implicitly opts a user into these transition
 * emails for v1 — there's no separate alert-preferences UI yet, so this
 * is simpler than the AlertSubscription table's full trigger-type
 * granularity implies, by design. Removing the IPO from your watchlist
 * (the existing DELETE /api/watchlist/[ipoId] route) is the unsubscribe
 * path — no separate token system yet.
 *
 * Delivery is tracked per (user, ipo, transition) in ReminderDelivery:
 * a row already marked SENT is never re-sent, even across duplicate
 * cron invocations, and a FAILED row is retried on the next transition
 * check rather than silently dropped.
 */
export async function notifyWatchersOfTransitions(transitions: StatusTransition[]): Promise<ReminderSummary> {
  const summary: ReminderSummary = { sent: 0, failed: 0, skipped: 0 };
  if (!getEmailReadiness().enabled) return summary;

  for (const t of transitions) {
    const template = TEMPLATES[`${t.from}->${t.to}`];
    if (!template) continue;
    const transitionKey = `${t.from}->${t.to}`;

    const watchers = await prisma.watchlistItem.findMany({
      where: { ipoId: t.ipoId },
      include: { user: true },
    });
    if (watchers.length === 0) continue;

    const { subject, body } = template(t.companyName);
    const detailUrl = `${SITE_URL}/ipo/${toIpoSlug(t.companyName)}`;
    const html = `
      <p>${body}</p>
      <p><a href="${detailUrl}">View ${t.companyName} details</a></p>
      <p style="color:#888;font-size:12px">
        You're getting this because you added ${t.companyName} to your IPOBharosa watchlist.
        <a href="${SITE_URL}/watchlist">Manage your watchlist</a> to stop these.
      </p>
    `.trim();

    for (const watcher of watchers) {
      if (!watcher.user.email) continue;

      const existing = await prisma.reminderDelivery.findUnique({
        where: {
          userId_ipoId_transition: { userId: watcher.userId, ipoId: t.ipoId, transition: transitionKey },
        },
      });
      if (existing?.status === "SENT") {
        summary.skipped++;
        continue;
      }

      let success = false;
      let lastError: string | null = null;
      let attempts = 0;
      while (attempts < MAX_ATTEMPTS && !success) {
        attempts++;
        try {
          await sendEmail({ to: watcher.user.email, subject, html });
          success = true;
        } catch (e) {
          lastError = (e as Error).message;
          if (attempts < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
        }
      }

      const priorAttempts = existing?.attempts ?? 0;
      await prisma.reminderDelivery.upsert({
        where: {
          userId_ipoId_transition: { userId: watcher.userId, ipoId: t.ipoId, transition: transitionKey },
        },
        create: {
          userId: watcher.userId,
          ipoId: t.ipoId,
          transition: transitionKey,
          status: success ? "SENT" : "FAILED",
          attempts,
          lastError: success ? null : lastError,
          sentAt: success ? new Date() : null,
        },
        update: {
          status: success ? "SENT" : "FAILED",
          attempts: priorAttempts + attempts,
          lastError: success ? null : lastError,
          sentAt: success ? new Date() : undefined,
        },
      });

      if (success) {
        summary.sent++;
      } else {
        summary.failed++;
        // Visible in Vercel function logs — the summary object returned
        // from the cron route surfaces the count too, so a failure run
        // is never just a silently-swallowed catch block.
        console.error(
          `Reminder delivery FAILED after ${attempts} attempt(s) for ${watcher.user.email} (${t.companyName} ${transitionKey}): ${lastError}`,
        );
      }
    }
  }

  return summary;
}
