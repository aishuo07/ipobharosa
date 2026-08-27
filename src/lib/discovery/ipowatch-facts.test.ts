import { describe, expect, it } from "vitest";
import { parseCr, parseIpoDate, parsePriceBand } from "./ipowatch-facts";

describe("parseCr", () => {
  it("parses a plain crore figure", () => {
    expect(parseCr("Approx ₹367.18 Crores")).toBe(367.18);
  });

  it("parses with thousands separators", () => {
    expect(parseCr("₹3,066.89 Cr.")).toBe(3066.89);
  });

  it("returns null when the value isn't Cr-denominated (e.g. a raw share count)", () => {
    expect(parseCr("Approx 1,00,00,000 Equity Shares")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseCr("")).toBeNull();
  });
});

describe("parsePriceBand", () => {
  it("parses a standard price band string", () => {
    expect(parsePriceBand("₹88 to ₹93 Per Share")).toEqual({ low: 88, high: 93 });
  });

  it("handles a missing rupee symbol on the upper bound", () => {
    expect(parsePriceBand("₹200 to 212")).toEqual({ low: 200, high: 212 });
  });

  it("returns null for a TBA/unpriced band", () => {
    expect(parsePriceBand("TBA")).toBeNull();
  });

  it("treats a fixed single price as a zero-width band", () => {
    expect(parsePriceBand("₹130 Per Share")).toEqual({ low: 130, high: 130 });
  });
});

describe("parseIpoDate", () => {
  it("parses ipowatch's date format", () => {
    const d = parseIpoDate("August 18, 2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7); // August, 0-indexed
    expect(d!.getDate()).toBe(18);
  });

  it("returns null for undefined input", () => {
    expect(parseIpoDate(undefined)).toBeNull();
  });

  it("returns null for unparseable text", () => {
    expect(parseIpoDate("TBA")).toBeNull();
  });
});
