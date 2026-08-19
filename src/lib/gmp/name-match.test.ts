import { describe, expect, it } from "vitest";
import { normalizedNamesMatch } from "./name-match";

describe("normalizedNamesMatch", () => {
  it("matches identical slugs", () => {
    expect(normalizedNamesMatch("Gaja Alternative", "Gaja Alternative")).toBe(true);
  });

  it("matches a short board name against the provider's full legal name", () => {
    expect(normalizedNamesMatch("Gaja Alternative", "Gaja Alternative Asset Management")).toBe(true);
  });

  it("matches when the provider name is shorter but distinctive", () => {
    expect(normalizedNamesMatch("Credent Connect N Care", "Credent Connect")).toBe(true);
  });

  it("rejects unrelated names", () => {
    expect(normalizedNamesMatch("Shankesh Jewellers", "Lalithaa Jewellery Mart")).toBe(false);
  });

  it("rejects a single shared generic token", () => {
    expect(normalizedNamesMatch("Tech Industries", "XYZ Tech")).toBe(false);
  });

  it("handles suffix variations through slug normalisation", () => {
    expect(normalizedNamesMatch("Technocraft Ventures Ltd", "Technocraft Ventures Limited")).toBe(true);
  });
});