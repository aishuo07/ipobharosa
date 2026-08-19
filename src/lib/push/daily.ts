import { prisma } from "@/lib/prisma";
import { sendPushBroadcast } from "@/lib/push/expo";
import { fmtINR } from "@/lib/board-helpers";

/**
 * Daily IPO push. Builds a "today in IPOs" message — openings, closings,
 * allotments and listings due today plus any IPO still open for bidding —
 * and broadcasts it to every registered device once per calendar day.
 *
 * Dedup is guaranteed by PushBroadcast's unique (kind, broadcastDate):
 * a second run on the same day sees the existing row and skips.
 */
export type DailyPushResult = {
  sent: boolean;
  skipped: boolean;
  message: string | null;
  accepted: number;
  failed: number;
};

export function broadcastDateInIst(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00.000Z`);
}

export function fmtDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export async function buildDailyPushMessage(now = new Date()): Promise<string> {
  const today = broadcastDateInIst(now);
  const nextWeek = new Date(today);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

  const published = await prisma.ipo.findMany({
    where: { publicationState: "PUBLISHED" },
    select: {
      id: true,
      company: { select: { name: true } },
      status: true,
      openDate: true,
      closeDate: true,
      allotmentDate: true,
      listingDate: true,
      priceBandLow: true,
      priceBandHigh: true,
      gmpSnapshots: {
        orderBy: { capturedAt: "desc" as const },
        take: 1,
        select: { medianValue: true },
      },
    },
  });

  const opens: string[] = [];
  const closes: string[] = [];
  const allotments: string[] = [];
  const listings: string[] = [];
  const openForBidding: string[] = [];

  for (const ipo of published) {
    const d = (iso: string | Date | null) => (iso ? new Date(iso) : null);
    const isToday = (date: Date | null) =>
      date !== null &&
      date.getUTCFullYear() === today.getUTCFullYear() &&
      date.getUTCMonth() === today.getUTCMonth() &&
      date.getUTCDate() === today.getUTCDate();

    if (isToday(d(ipo.openDate))) opens.push(ipo.company.name);
    if (isToday(d(ipo.closeDate))) closes.push(ipo.company.name);
    if (isToday(d(ipo.allotmentDate))) allotments.push(ipo.company.name);
    if (isToday(d(ipo.listingDate))) listings.push(ipo.company.name);

    if (ipo.status === "OPEN") {
      const closeDate = d(ipo.closeDate);
      if (closeDate && closeDate < nextWeek) {
        const gmp = ipo.gmpSnapshots[0]?.medianValue ? ` · GMP ₹${fmtINR(Number(ipo.gmpSnapshots[0].medianValue)).replace(/^₹/, "")}` : "";
        openForBidding.push(`${ipo.company.name}${gmp}`);
      }
    }
  }

  const lines: string[] = [];
  const append = (label: string, names: string[]) => {
    if (names.length > 0) lines.push(`${label}: ${names.slice(0, 6).join(", ")}${names.length > 6 ? ` +${names.length - 6} more` : ""}`);
  };
  append("Opening today", opens);
  append("Closing today", closes);
  append("Allotment today", allotments);
  append("Listing today", listings);

  if (lines.length === 0) {
    lines.push("No IPO milestone scheduled for today.");
  }
  if (openForBidding.length > 0) {
    lines.push(`Open for bidding: ${openForBidding.join(" · ")}`);
  }

  return lines.join("\n");
}

export async function sendDailyPush(now = new Date()): Promise<DailyPushResult> {
  const date = broadcastDateInIst(now);
  const existing = await prisma.pushBroadcast.findUnique({
    where: { kind_broadcastDate: { kind: "daily", broadcastDate: date } },
  });
  if (existing) return { sent: false, skipped: true, message: existing.body, accepted: existing.sentCount, failed: existing.failedCount };

  const body = await buildDailyPushMessage(now);
  const result = await sendPushBroadcast({ title: "📈 IPOBharosa — today's IPOs", body, data: { type: "daily" } });

  await prisma.pushBroadcast.create({
    data: { kind: "daily", broadcastDate: date, title: "📈 IPOBharosa — today's IPOs", body, sentCount: result.accepted, failedCount: result.failed },
  });

  return { sent: true, skipped: false, message: body, accepted: result.accepted, failed: result.failed };
}