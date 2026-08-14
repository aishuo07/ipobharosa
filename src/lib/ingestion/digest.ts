import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/resend";
import type { IngestionSummary } from "./run-cycle";

type DigestView = {
  summary: IngestionSummary;
  publicationCounts: Record<string, number>;
  openIncidents: number;
  financialReviews: number;
  unhealthySources: string[];
};

export function digestDateInIst(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00.000Z`);
}

export function renderDailyDigest(view: DigestView): string {
  const { summary } = view;
  const items = [
    `${view.publicationCounts.PUBLISHED ?? 0} total published IPOs`,
    `${summary.revalidation.published} newly published`,
    `${summary.revalidation.retries} official checks waiting to retry`,
    `${summary.revalidation.exceptions} new/updated conflicts`,
    `${summary.publishedRevalidation.drifts} published-data drift(s)`,
    `${view.openIncidents} unresolved official-source incident(s)`,
    `${view.financialReviews} financial metric(s) waiting for evidence review`,
  ];
  const sourceLine = view.unhealthySources.length
    ? `<p><strong>Sources needing attention:</strong> ${view.unhealthySources.join(", ")}</p>`
    : "<p><strong>Source health:</strong> no source currently has consecutive failures.</p>";
  return `<h2>IPOBharosa daily data digest</h2><ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>${sourceLine}<p><a href="https://ipobharosa.vercel.app/admin">Open admin dashboard</a></p>`;
}

function digestRecipients(): string[] {
  return (process.env.INGESTION_ALERT_RECIPIENTS ?? "aish.iiitb@gmail.com")
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

export async function sendDailyDigestIfDue(summary: IngestionSummary, now = new Date()): Promise<void> {
  if (process.env.INGESTION_DAILY_DIGEST_ENABLED === "false") return;
  const digestDate = digestDateInIst(now);
  const [publicationGroups, openIncidents, financialReviews, unhealthy] = await Promise.all([
    prisma.ipo.groupBy({ by: ["publicationState"], _count: true }),
    prisma.officialEvidenceIncident.count({ where: { status: "OPEN" } }),
    prisma.financialRevision.count({ where: { state: { in: ["AUTO_VERIFIED", "REVIEW_REQUIRED"] } } }),
    prisma.sourceOperationHealth.findMany({ where: { consecutiveFailures: { gt: 0 } }, select: { source: true, operation: true } }),
  ]);
  const html = renderDailyDigest({
    summary,
    publicationCounts: Object.fromEntries(publicationGroups.map((group) => [group.publicationState, group._count])),
    openIncidents,
    financialReviews,
    unhealthySources: unhealthy.map((source) => `${source.source} ${source.operation}`),
  });

  for (const recipient of digestRecipients()) {
    const existing = await prisma.digestDelivery.findUnique({ where: { digestDate_recipient: { digestDate, recipient } } });
    if (existing?.status === "SENT") continue;
    const delivery = existing ?? await prisma.digestDelivery.create({
      data: { digestDate, recipient, status: "FAILED", attempts: 0, lastError: "delivery not attempted" },
    });
    try {
      await sendEmail({ to: recipient, subject: `IPOBharosa data digest — ${digestDate.toISOString().slice(0, 10)}`, html });
      await prisma.digestDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", attempts: { increment: 1 }, sentAt: new Date(), lastError: null },
      });
    } catch (error) {
      await prisma.digestDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: (error instanceof Error ? error.message : String(error)).slice(0, 1_000) },
      });
    }
  }
}
