import { describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
}));

import {
  isValidPan,
  isValidUpiId,
  isValidDematClientId,
  normalizePan,
  normalizeUpiId,
  buildUpiMandate,
  applicationAmount,
  vpaForRegistrar,
} from "./investor-profile";

describe("investor-profile validation", () => {
  it("accepts a valid PAN", () => {
    expect(isValidPan("ABCDE1234F")).toBe(true);
    expect(isValidPan("abcde1234f")).toBe(true);
  });

  it("rejects malformed PANs", () => {
    expect(isValidPan("ABCDE1234")).toBe(false);
    expect(isValidPan("ABCDE12345")).toBe(false);
    expect(isValidPan("12345ABCDE")).toBe(false);
    expect(isValidPan("")).toBe(false);
  });

  it("normalizes PAN to uppercase", () => {
    expect(normalizePan("abcde1234f")).toBe("ABCDE1234F");
  });

  it("accepts valid UPI IDs", () => {
    expect(isValidUpiId("9876543210@ybl")).toBe(true);
    expect(isValidUpiId("name@okaxis")).toBe(true);
    expect(isValidUpiId("first.last@paytm")).toBe(true);
  });

  it("rejects malformed UPI IDs", () => {
    expect(isValidUpiId("9876543210")).toBe(false);
    expect(isValidUpiId("@ybl")).toBe(false);
    expect(isValidUpiId("name@")).toBe(false);
  });

  it("normalizes UPI IDs to lowercase without spaces", () => {
    expect(normalizeUpiId("  NAME @ YBL ")).toBe("name@ybl");
  });

  it("validates full demat client IDs by provider", () => {
    expect(isValidDematClientId("1208160012345678", "CDSL")).toBe(true);
    expect(isValidDematClientId("12081600123456", "NSDL")).toBe(true);
    expect(isValidDematClientId("1208160012345678", "NSDL")).toBe(false);
    expect(isValidDematClientId("12081600123456", "CDSL")).toBe(false);
    expect(isValidDematClientId("12345678", "CDSL")).toBe(false);
    expect(isValidDematClientId("12345678", "NSDL")).toBe(false);
    expect(isValidDematClientId("1234567", "CDSL")).toBe(false);
    expect(isValidDematClientId("12345678901234567890", "CDSL")).toBe(false);
    expect(isValidDematClientId("abc", "CDSL")).toBe(false);
    expect(isValidDematClientId("1208160012345678", null)).toBe(false);
  });
});

describe("UPI mandate", () => {
  it("builds a mandate deep link with ASBA params", () => {
    const mandate = buildUpiMandate({
      upiId: "9876543210@ybl",
      payeeVpa: "sponsor@bank",
      payeeName: "Example Co Ltd",
      amount: 14400,
      transactionNote: "IPO ABCDE1234F",
    });
    expect(mandate.deepLink).toContain("upi://pay?");
    expect(mandate.deepLink).toContain("pa=sponsor%40bank");
    expect(mandate.deepLink).toContain("am=14400");
    expect(mandate.deepLink).toContain("mode=02");
    expect(mandate.deepLink).toContain("purpose=20");
    expect(mandate.deepLink).toContain("tn=IPO+ABCDE1234F");
  });

  it("rounds amounts to paise", () => {
    const mandate = buildUpiMandate({
      upiId: "a@ybl",
      payeeVpa: "sponsor@bank",
      payeeName: "Co",
      amount: 14400.555,
      transactionNote: "IPO",
    });
    expect(mandate.amount).toBe(14400.56);
  });
});

describe("application amount", () => {
  it("computes lots x lot size x upper price band", () => {
    expect(applicationAmount({ lotSize: 50, priceBandHigh: 288 }, 1)).toBe(14400);
    expect(applicationAmount({ lotSize: 50, priceBandHigh: 288 }, 2)).toBe(28800);
  });
});

describe("registrar VPA lookup", () => {
  it("returns null for unknown registrars", () => {
    expect(vpaForRegistrar("Some Broker")).toBeNull();
    expect(vpaForRegistrar(null)).toBeNull();
  });

  it("matches known registrar families but returns null until configured", () => {
    expect(vpaForRegistrar("KFin Technologies Ltd")).toBeNull();
    expect(vpaForRegistrar("Link Intime India Pvt Ltd")).toBeNull();
  });
});