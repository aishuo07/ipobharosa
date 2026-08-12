import { describe, expect, it } from "vitest";
import { normalizeIssuerName, parseIndianDate, parseInteger, parsePriceBand } from "./normalization";

describe("official-source normalization", () => {
  it("normalizes legal suffixes and punctuation for issuer matching", () => {
    expect(normalizeIssuerName("Shiprocket Limited")).toBe("shiprocket");
    expect(normalizeIssuerName("SHIPROCKET LTD.")).toBe("shiprocket");
  });

  it("parses NSE price ranges without treating currency punctuation as data", () => {
    expect(parsePriceBand("Rs. 92 to Rs. 97 per Equity Share")).toEqual({ low: 92, high: 97 });
    expect(parsePriceBand("Rs.220")).toEqual({ low: 220, high: 220 });
  });

  it("parses NSE dates and formatted integers", () => {
    expect(parseIndianDate("12-Aug-2026").toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(parseIndianDate("13-August-2026").toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(parseInteger("1,600 Equity Shares and in multiples thereof")).toBe(1600);
  });
});
