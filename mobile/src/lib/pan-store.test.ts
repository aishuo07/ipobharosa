import { describe, expect, it, vi } from "vitest";
import { isValidPan, normalizePan, PAN_PATTERN } from "@/src/lib/pan-store";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
}));

describe("PAN validation", () => {
  it("matches the canonical PAN format ABCDE1234F", () => {
    expect(PAN_PATTERN.test("ABCDE1234F")).toBe(true);
  });

  it.each(["ABC1D234EF", "KXYZL5678", "ABCDE12345", "abcde1234", "ABCDE1234", "12345ABCDE"])(
    "rejects invalid PAN %s",
    (value) => {
      expect(PAN_PATTERN.test(value)).toBe(false);
    },
  );

  it("normalizes lowercase input to uppercase", () => {
    expect(normalizePan(" abcde1234f ")).toBe("ABCDE1234F");
  });

  it("accepts only values that pass isValidPan after normalization", () => {
    expect(isValidPan("ABCDE1234F")).toBe(true);
    expect(isValidPan("abcde")).toBe(false);
  });
});