import type { BoardIpo } from "./board-data";

export const MARKET_TIME_ZONE = "Asia/Kolkata";

export const IPO_CALENDAR_EVENTS = [
  { type: "opens", label: "Opens", dateKey: "openDate" },
  { type: "closes", label: "Closes", dateKey: "closeDate" },
  { type: "allotment", label: "Allotment", dateKey: "allotmentDate" },
  { type: "lists", label: "Lists", dateKey: "listingDate" },
] as const satisfies readonly {
  type: string;
  label: string;
  dateKey: keyof BoardIpo;
}[];

export type IpoCalendarEventType = (typeof IPO_CALENDAR_EVENTS)[number]["type"];

export type ChronologyIpo = Pick<
  BoardIpo,
  "id" | "companyName" | "openDate" | "closeDate" | "allotmentDate" | "listingDate"
>;

export type IpoCalendarEvent<T extends ChronologyIpo = ChronologyIpo> = {
  ipo: T;
  type: IpoCalendarEventType;
  label: string;
  iso: string;
  dayKey: string;
  timestamp: number;
};

export type CatalogueSort = "NEXT_EVENT" | "OPEN_ASC" | "OPEN_DESC";

const AGENDA_EVENT_PRIORITY: Record<IpoCalendarEventType, number> = {
  closes: 0,
  allotment: 1,
  lists: 2,
  opens: 3,
};

function marketDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** A stable YYYY-MM-DD key in the Indian market timezone. */
export function marketDayKey(value: string | Date | number): string {
  const date = value instanceof Date ? value : new Date(value);
  const { year, month, day } = marketDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A timezone-stable month anchor for server/client calendar hydration. */
export function marketMonthAnchor(value: string | Date | number): Date {
  const [year, month] = marketDayKey(value).split("-").map(Number);
  // Midday UTC remains in the same calendar month in every supported browser
  // timezone, unlike a local-midnight Date constructed independently on the
  // server and client.
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

export function formatMarketDate(
  value: string | Date | number,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: MARKET_TIME_ZONE }).format(date);
}

function dayKeyOffset(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function sortCalendarAgendaEvents<T extends ChronologyIpo>(
  events: readonly IpoCalendarEvent<T>[],
  now: number,
): IpoCalendarEvent<T>[] {
  const today = marketDayKey(now);
  return [...events].sort((a, b) => {
    const todayA = a.dayKey === today;
    const todayB = b.dayKey === today;
    if (todayA !== todayB) return todayA ? -1 : 1;
    return a.dayKey.localeCompare(b.dayKey)
      || AGENDA_EVENT_PRIORITY[a.type] - AGENDA_EVENT_PRIORITY[b.type]
      || a.ipo.companyName.localeCompare(b.ipo.companyName);
  });
}

export function calendarEventTimingLabel(event: IpoCalendarEvent, now: number): string {
  const today = marketDayKey(now);
  const timing = event.dayKey === today
    ? "today"
    : event.dayKey === dayKeyOffset(today, 1)
      ? "tomorrow"
      : `on ${formatMarketDate(event.iso, { day: "numeric", month: "short", year: "numeric" })}`;
  const label = event.type === "lists" ? "Listing" : event.type === "allotment" ? "Allotment" : event.label;
  return `${label} ${timing}`;
}

export function lifecycleEventsForIpo<T extends ChronologyIpo>(ipo: T): IpoCalendarEvent<T>[] {
  return IPO_CALENDAR_EVENTS.flatMap((definition) => {
    const iso = ipo[definition.dateKey];
    if (!iso) return [];
    return [{
      ipo,
      type: definition.type,
      label: definition.label,
      iso,
      dayKey: marketDayKey(iso),
      timestamp: new Date(iso).getTime(),
    }];
  }).sort((a, b) => a.timestamp - b.timestamp || a.label.localeCompare(b.label));
}

export function lifecycleEventsByDay<T extends ChronologyIpo>(ipos: readonly T[]): Record<string, IpoCalendarEvent<T>[]> {
  const grouped: Record<string, IpoCalendarEvent<T>[]> = {};
  for (const ipo of ipos) {
    for (const event of lifecycleEventsForIpo(ipo)) (grouped[event.dayKey] ??= []).push(event);
  }
  for (const events of Object.values(grouped)) {
    events.sort((a, b) => a.timestamp - b.timestamp || a.ipo.companyName.localeCompare(b.ipo.companyName));
  }
  return grouped;
}

export function chronologyAnchor<T extends ChronologyIpo>(ipo: T, now: number): IpoCalendarEvent<T> {
  const events = lifecycleEventsForIpo(ipo);
  const today = marketDayKey(now);
  return events.find((event) => event.dayKey >= today) ?? events.at(-1)!;
}

export function sortIposByChronology<T extends ChronologyIpo>(
  ipos: readonly T[],
  now: number,
  sort: CatalogueSort = "NEXT_EVENT",
): T[] {
  const rows = [...ipos];
  if (sort === "OPEN_ASC" || sort === "OPEN_DESC") {
    const direction = sort === "OPEN_ASC" ? 1 : -1;
    return rows.sort((a, b) =>
      direction * (new Date(a.openDate).getTime() - new Date(b.openDate).getTime())
      || a.companyName.localeCompare(b.companyName),
    );
  }
  const today = marketDayKey(now);
  return rows.sort((a, b) => {
    const anchorA = chronologyAnchor(a, now);
    const anchorB = chronologyAnchor(b, now);
    const pastA = anchorA.dayKey < today;
    const pastB = anchorB.dayKey < today;
    if (pastA !== pastB) return pastA ? 1 : -1;
    return anchorA.timestamp - anchorB.timestamp || a.companyName.localeCompare(b.companyName);
  });
}

export function groupIposByChronology<T extends ChronologyIpo>(
  ipos: readonly T[],
  now: number,
  sort: CatalogueSort = "NEXT_EVENT",
): { dayKey: string; event: IpoCalendarEvent<T>; ipos: T[] }[] {
  const groups = new Map<string, { event: IpoCalendarEvent<T>; ipos: T[] }>();
  for (const ipo of sortIposByChronology(ipos, now, sort)) {
    const event = sort === "NEXT_EVENT"
      ? chronologyAnchor(ipo, now)
      : lifecycleEventsForIpo(ipo).find((candidate) => candidate.type === "opens")!;
    const existing = groups.get(event.dayKey);
    if (existing) existing.ipos.push(ipo);
    else groups.set(event.dayKey, { event, ipos: [ipo] });
  }
  return [...groups].map(([dayKey, group]) => ({ dayKey, ...group }));
}
