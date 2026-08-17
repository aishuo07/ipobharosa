import { describe, expect, it } from "vitest";
import { resolveSiteUrl, siteUrlConfigured } from "./site-url";

describe("site URL contract", () => {
  it("uses the safe public fallback when no domain is configured", () => {
    expect(resolveSiteUrl({})).toBe("https://ipodekho-ten.vercel.app");
    expect(siteUrlConfigured({})).toBe(false);
  });

  it("normalizes one configured origin and allows localhost for CI", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://www.ipobharosa.com/" })).toBe("https://www.ipobharosa.com");
    expect(resolveSiteUrl({ SITE_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it("rejects mismatched public and server origins", () => {
    expect(() => resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: "https://www.ipobharosa.com",
      SITE_URL: "https://ipodekho-ten.vercel.app",
    })).toThrow("must resolve to the same origin");
  });

  it("rejects unsafe protocols and non-origin paths", () => {
    expect(() => resolveSiteUrl({ SITE_URL: "http://ipobharosa.com" })).toThrow("must use HTTPS");
    expect(() => resolveSiteUrl({ SITE_URL: "https://ipobharosa.com/app" })).toThrow("must be an origin");
  });
});
