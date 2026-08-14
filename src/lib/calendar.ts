import type { BoardIpo } from "@/lib/board-data";
import { boardFilterLabel, boardFilterQuery, type BoardFilter } from "@/lib/board-filter";
import { resolveSiteUrl } from "@/lib/site-url";

const SITE_URL = resolveSiteUrl();

type CalendarEvent = {
  uid: string;
  title: string;
  date: string;
  description: string;
  url: string;
};

function compactDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function nextDay(iso: string): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function ipoCalendarEvents(ipo: BoardIpo): CalendarEvent[] {
  const url = `${SITE_URL}/ipo/${ipo.slug}`;
  const description = `${ipo.verification.label}. ${ipo.verification.issueSummary ?? ipo.verification.description} Review current facts, verification state and source links: ${url}`;
  return [
    ["opens", "IPO opens", ipo.openDate],
    ["closes", "IPO closes", ipo.closeDate],
    ["allotment", "Allotment expected", ipo.allotmentDate],
    ["listing", "Listing expected", ipo.listingDate],
  ].flatMap(([key, label, date]) => date ? [{
    uid: `${ipo.id}-${key}@ipobharosa`,
    title: `[${ipo.verification.calendarLabel}] ${ipo.companyName}: ${label}`,
    date,
    description,
    url,
  }] : []);
}

export function buildIcs(ipos: BoardIpo[], board: BoardFilter = "ALL"): string {
  const events = ipos.flatMap(ipoCalendarEvents).map((event) => [
    "BEGIN:VEVENT",
    `UID:${escapeIcs(event.uid)}`,
    `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
    `DTEND;VALUE=DATE:${compactDate(nextDay(event.date))}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `URL:${event.url}`,
    "END:VEVENT",
  ].join("\r\n"));

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IPOBharosa//IPO Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(`IPOBharosa — ${boardFilterLabel(board)}`)}`,
    "X-WR-CALDESC:Live IPO dates with source-backed details at IPOBharosa",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function googleCalendarSubscriptionUrl(board: BoardFilter = "ALL"): string {
  const feedUrl = `${SITE_URL}/api/calendar${boardFilterQuery(board)}`;
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`;
}
