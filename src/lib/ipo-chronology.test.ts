import { describe, expect, it } from "vitest";
import {
  calendarEventTimingLabel,
  chronologyAnchor,
  dateLedgerGroups,
  formatMarketDate,
  groupIposByChronology,
  lifecycleEventsByDay,
  lifecycleEventsForIpo,
  marketDayKey,
  marketDayOffset,
  marketMonthAnchor,
  sortCalendarAgendaEvents,
  sortIposByChronology,
  type ChronologyIpo,
} from "./ipo-chronology";

function ipo(overrides: Partial<ChronologyIpo> = {}): ChronologyIpo {
  return {
    id: "one",
    companyName: "Alpha Limited",
    openDate: "2026-08-10T00:00:00.000Z",
    closeDate: "2026-08-12T00:00:00.000Z",
    allotmentDate: "2026-08-14T00:00:00.000Z",
    listingDate: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("IPO chronology", () => {
  it("uses the Indian market day instead of the machine timezone", () => {
    expect(marketDayKey("2026-08-14T20:00:00.000Z")).toBe("2026-08-15");
    expect(formatMarketDate("2026-08-14T20:00:00.000Z", { day: "numeric", month: "short" })).toBe("15 Aug");
  });

  it("creates a stable market-month anchor from the server timestamp", () => {
    expect(marketMonthAnchor("2026-08-31T20:00:00.000Z").toISOString()).toBe("2026-09-01T12:00:00.000Z");
  });

  it("builds a seven-day date ledger and keeps an empty Today group", () => {
    const now = Date.parse("2026-08-15T06:00:00.000Z");
    const rows = [ipo({
      openDate: "2026-08-17T00:00:00.000Z",
      closeDate: "2026-08-22T00:00:00.000Z",
      allotmentDate: "2026-08-24T00:00:00.000Z",
      listingDate: "2026-08-26T00:00:00.000Z",
    })];
    const groups = dateLedgerGroups(rows, now, 7);
    expect(groups.map((group) => group.dayKey)).toEqual(["2026-08-15", "2026-08-17", "2026-08-22"]);
    expect(groups[0].events).toEqual([]);
    expect(groups[1].events[0].type).toBe("opens");
  });

  it("can show all upcoming dates beyond the homepage week", () => {
    const now = Date.parse("2026-08-15T06:00:00.000Z");
    const groups = dateLedgerGroups([ipo({
      openDate: "2026-08-24T00:00:00.000Z",
      closeDate: "2026-08-25T00:00:00.000Z",
      allotmentDate: "2026-08-27T00:00:00.000Z",
      listingDate: "2026-08-31T00:00:00.000Z",
    })], now, null);
    expect(groups.at(-1)?.dayKey).toBe("2026-08-31");
    expect(marketDayOffset("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("puts every today event first, then future events across month boundaries", () => {
    const today = Date.parse("2026-08-15T06:00:00.000Z");
    const alpha = lifecycleEventsForIpo(ipo({
      companyName: "Alpha",
      openDate: "2026-08-15T00:00:00.000Z",
      closeDate: "2026-08-16T00:00:00.000Z",
      allotmentDate: "2026-09-01T00:00:00.000Z",
      listingDate: "2026-09-03T00:00:00.000Z",
    }));
    const beta = lifecycleEventsForIpo(ipo({
      id: "two",
      companyName: "Beta",
      openDate: "2026-08-12T00:00:00.000Z",
      closeDate: "2026-08-15T00:00:00.000Z",
      allotmentDate: "2026-08-20T00:00:00.000Z",
      listingDate: "2026-08-24T00:00:00.000Z",
    }));
    const result = sortCalendarAgendaEvents([...alpha, ...beta].filter((event) => event.dayKey >= "2026-08-15"), today);
    expect(result.map((event) => `${event.dayKey}:${event.type}`)).toEqual([
      "2026-08-15:closes",
      "2026-08-15:opens",
      "2026-08-16:closes",
      "2026-08-20:allotment",
      "2026-08-24:lists",
      "2026-09-01:allotment",
      "2026-09-03:lists",
    ]);
  });

  it("uses explicit today and tomorrow event labels", () => {
    const now = Date.parse("2026-08-15T06:00:00.000Z");
    const events = lifecycleEventsForIpo(ipo({
      openDate: "2026-08-15T00:00:00.000Z",
      closeDate: "2026-08-16T00:00:00.000Z",
    }));
    expect(calendarEventTimingLabel(events.find((event) => event.type === "opens")!, now)).toBe("Opens today");
    expect(calendarEventTimingLabel(events.find((event) => event.type === "closes")!, now)).toBe("Closes tomorrow");
  });

  it("creates the four public lifecycle events in chronological order", () => {
    expect(lifecycleEventsForIpo(ipo()).map((event) => event.type)).toEqual([
      "opens",
      "closes",
      "allotment",
      "lists",
    ]);
  });

  it("groups events deterministically by market day", () => {
    const second = ipo({ id: "two", companyName: "Beta Limited" });
    const grouped = lifecycleEventsByDay([second, ipo()]);
    expect(grouped["2026-08-10"].map((event) => event.ipo.companyName)).toEqual([
      "Alpha Limited",
      "Beta Limited",
    ]);
  });

  it("anchors an open issue to its next event and a completed issue to listing", () => {
    const row = ipo();
    expect(chronologyAnchor(row, Date.parse("2026-08-11T05:00:00.000Z")).type).toBe("closes");
    expect(chronologyAnchor(row, Date.parse("2026-08-20T05:00:00.000Z")).type).toBe("lists");
  });

  it("sorts future/current events before completed issues", () => {
    const past = ipo({ id: "past", companyName: "Past", listingDate: "2026-08-05T00:00:00.000Z" });
    const future = ipo({
      id: "future",
      companyName: "Future",
      openDate: "2026-08-16T00:00:00.000Z",
      closeDate: "2026-08-18T00:00:00.000Z",
      allotmentDate: "2026-08-20T00:00:00.000Z",
      listingDate: "2026-08-24T00:00:00.000Z",
    });
    expect(sortIposByChronology([past, future], Date.parse("2026-08-15T00:00:00.000Z")).map((row) => row.id)).toEqual([
      "future",
      "past",
    ]);
  });

  it("groups catalogue rows by their next lifecycle day", () => {
    const rows = [ipo(), ipo({ id: "two", companyName: "Beta Limited" })];
    const groups = groupIposByChronology(rows, Date.parse("2026-08-11T05:00:00.000Z"));
    expect(groups).toHaveLength(1);
    expect(groups[0].event.label).toBe("Closes");
    expect(groups[0].ipos.map((row) => row.companyName)).toEqual(["Alpha Limited", "Beta Limited"]);
  });
});
