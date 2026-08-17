import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  const value = manifest();

  it("is installable from the product root", () => {
    expect(value.name).toContain("IPOBharosa");
    expect(value.short_name).toBe("IPOBharosa");
    expect(value.start_url).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
  });

  it("provides standard and maskable app icons", () => {
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]));
  });
});
