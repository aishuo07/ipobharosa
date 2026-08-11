import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/resend";
import type { StatusTransition } from "@/lib/ipo-status";

const SITE_URL = "https://ipobharosa.vercel.app";

const TEMPLATES: Record<string, (companyName: string) => { subject: string; body: string }> = {
  "UPCOMING->OPEN": (name) => ({
    subject: `${name} IPO is now open for bidding`,
    body: `${name}'s IPO just opened for subscription. Check the price band, lot size, and current GMP before it closes.`,
  }),
  "OPEN->CLOSED": (name) => ({
    subject: `${name} IPO has closed`,
    body: `${name}'s IPO bidding window just closed. Allotment is next — we'll email you again once that's finalized.`,
  }),
};

/**
 * Watchlisting an IPO implicitly opts a user into these transition
 * emails for v1 — there's no separate alert-preferences UI yet, so this
 * is simpler than the AlertSubscription table's full trigger-type
 * granularity implies, by design.
 */
export async function notifyWatchersOfTransitions(transitions: StatusTransition[]): Promise<number> {
  let sent = 0;

  for (const t of transitions) {
    const template = TEMPLATES[`${t.from}->${t.to}`];
    if (!template) continue;

    const watchers = await prisma.watchlistItem.findMany({
      where: { ipoId: t.ipoId },
      include: { user: true },
    });
    if (watchers.length === 0) continue;

    const { subject, body } = template(t.companyName);
    const html = `
      <p>${body}</p>
      <p><a href="${SITE_URL}">View on IPOBharosa</a></p>
      <p style="color:#888;font-size:12px">You're getting this because you added ${t.companyName} to your IPOBharosa watchlist.</p>
    `.trim();

    for (const watcher of watchers) {
      if (!watcher.user.email) continue;
      try {
        await sendEmail({ to: watcher.user.email, subject, html });
        sent++;
      } catch (e) {
        console.error(`Failed to send reminder to ${watcher.user.email}:`, (e as Error).message);
      }
    }
  }

  return sent;
}
