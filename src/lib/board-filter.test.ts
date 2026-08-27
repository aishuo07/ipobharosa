import { describe, expect, it } from "vitest";
import type { BoardIpo } from "./board-data";
import {
  boardFilterLabel,
  boardFilterQuery,
  filterIposByBoard,
  filterIposByStatus,
  filterIposByVerification,
  parseBoardFilter,
} from "./board-filter";

const makeIpo = (id: string, board: BoardIpo["board"]): BoardIpo => ({
  id,
  slug: id,
  companyName: id,
  sector: "",
  status: "OPEN",
  board,
  verification: {
    state: "VERIFIED",
    label: "Automated verification passed",
    shortLabel: "Verified",
    calendarLabel: "Verified",
    description: "Verified",
    checkedAt: null,
    nextCheckAt: null,
    issueSummary: null,
  },
  priceBandLow: 1,
  priceBandHigh: 1,
  lotSize: 1,
  issueSizeCr: 1,
  freshIssueCr: null,
  ofsCr: null,
  openDate: "",
  closeDate: "",
  allotmentDate: "",
  refundDate: "",
  listingDate: "",
  listingPrice: null,
  registrar: null,
  leadManagers: [],
  gmp: null,
  subscription: null,
  gmpHistory: [],
  documents: [],
  financials: [],
  provenance: { discovery: [], gmp: [], subscription: null, officialFields: [] },
});

describe("board filters", () => {
  const ipos = [makeIpo("main", "MAINBOARD"), makeIpo("sme", "SME")];

  it("parses only supported public query values", () => {
    expect(parseBoardFilter(null)).toBe("ALL");
    expect(parseBoardFilter("")).toBe("ALL");
    expect(parseBoardFilter("MAINBOARD")).toBe("MAINBOARD");
    expect(parseBoardFilter("SME")).toBe("SME");
    expect(parseBoardFilter("mainboard")).toBeNull();
    expect(parseBoardFilter("UNKNOWN")).toBeNull();
  });

  it("filters IPOs without mutating the source array", () => {
    expect(filterIposByBoard(ipos, "ALL")).toEqual(ipos);
    expect(filterIposByBoard(ipos, "MAINBOARD").map((ipo) => ipo.id)).toEqual(["main"]);
    expect(filterIposByBoard(ipos, "SME").map((ipo) => ipo.id)).toEqual(["sme"]);
    expect(ipos).toHaveLength(2);
  });

  it("builds human labels and stable feed queries", () => {
    expect(boardFilterLabel("ALL")).toBe("All IPOs");
    expect(boardFilterLabel("MAINBOARD")).toBe("Mainboard");
    expect(boardFilterLabel("SME")).toBe("SME");
    expect(boardFilterQuery("ALL")).toBe("");
    expect(boardFilterQuery("SME")).toBe("?board=SME");
  });

  it("shows every published IPO in the default ALL status view", () => {
    const open = makeIpo("open", "MAINBOARD");
    const upcoming = { ...makeIpo("upcoming", "SME"), status: "UPCOMING" as const };
    const closed = { ...makeIpo("closed", "MAINBOARD"), status: "CLOSED" as const };

    expect(filterIposByStatus([open, upcoming, closed], "ALL").map((ipo) => ipo.id)).toEqual([
      "open",
      "upcoming",
      "closed",
    ]);
    expect(filterIposByStatus([open, upcoming, closed], "UPCOMING").map((ipo) => ipo.id)).toEqual([
      "upcoming",
    ]);
  });

  it("filters mixed-trust IPOs without hiding them from the all-data view", () => {
    const verified = makeIpo("verified", "MAINBOARD");
    const pending = { ...makeIpo("pending", "SME"), verification: { ...makeIpo("pending", "SME").verification, state: "PENDING" as const } };
    expect(filterIposByVerification([verified, pending], "ALL")).toHaveLength(2);
    expect(filterIposByVerification([verified, pending], "PENDING").map((ipo) => ipo.id)).toEqual(["pending"]);
  });
});
