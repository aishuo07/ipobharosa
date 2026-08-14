import { describe, expect, it, vi } from "vitest";
import { assertAllowedBseUrl, getBseJson } from "./bse-client";

describe("bounded BSE transport", () => {
  it("allows only the fixed HTTPS host and known read endpoints", () => {
    expect(assertAllowedBseUrl("https://api.bseindia.com/BseIndiaAPI/api/GetMkt_ISSUE_BBS_IPO/w?IPO_NO=1").hostname).toBe("api.bseindia.com");
    expect(() => assertAllowedBseUrl("https://example.com/BseIndiaAPI/api/GetMkt_ISSUE_BBS_IPO/w?IPO_NO=1")).toThrow("not allowed");
    expect(() => assertAllowedBseUrl("http://api.bseindia.com/BseIndiaAPI/api/GetMkt_ISSUE_BBS_IPO/w?IPO_NO=1")).toThrow("not allowed");
    expect(() => assertAllowedBseUrl("https://api.bseindia.com/unknown")).toThrow("not allowed");
  });

  it("validates JSON returned by the injected bounded request", async () => {
    const request = vi.fn(async () => JSON.stringify({ Table: [{ IPO_NO: 1 }] }));
    await expect(getBseJson("https://api.bseindia.com/BseIndiaAPI/api/GetPublicIssue_par_updated/w?flag=1", request)).resolves.toEqual({ Table: [{ IPO_NO: 1 }] });
    expect(request).toHaveBeenCalledOnce();
    await expect(getBseJson("https://api.bseindia.com/BseIndiaAPI/api/GetPublicIssue_par_updated/w?flag=1", async () => "not json")).rejects.toThrow("invalid JSON");
  });
});
