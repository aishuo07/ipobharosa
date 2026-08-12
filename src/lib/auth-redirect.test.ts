import { describe, expect, it } from "vitest";
import { loginPathFor, safeRedirectPath } from "./auth-redirect";

describe("safeRedirectPath", () => {
  it("keeps an internal admin destination", () => {
    expect(safeRedirectPath("/admin/financials")).toBe("/admin/financials");
  });

  it.each([
    "https://evil.example/admin",
    "//evil.example/admin",
    "javascript:alert(1)",
    "admin/financials",
  ])("rejects unsafe callback %s", (callback) => {
    expect(safeRedirectPath(callback)).toBe("/");
  });

  it("uses the first callback when query parsing returns an array", () => {
    expect(safeRedirectPath(["/admin", "//evil.example"])).toBe("/admin");
  });
});

describe("loginPathFor", () => {
  it("encodes the return destination", () => {
    expect(loginPathFor("/admin/financials")).toBe(
      "/login?callbackUrl=%2Fadmin%2Ffinancials",
    );
  });
});
