import { describe, expect, it } from "vitest";
import {
  chronologyAnchor,
  groupIposByChronology,
  lifecycleEventsByDay,
  lifecycleEventsForIpo,
  marketDayKey,
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
