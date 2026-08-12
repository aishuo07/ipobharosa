import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFilingEvidence } from "./filing-evidence";

afterEach(() => vi.unstubAllGlobals());

describe("downloadFilingEvidence", () => {
  it("hashes the exact PDF bytes from an official source", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(Buffer.from("%PDF-test-evidence"), {
      status: 200, headers: { "content-type": "application/pdf" },
    })));
    const result = await downloadFilingEvidence("https://www.bseindia.com/corporates/rhp.pdf");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.byteLength).toBe(18);
  });

  it("rejects HTML masquerading as a filing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>blocked</html>", { status: 200 })));
    await expect(downloadFilingEvidence("https://nsearchives.nseindia.com/rhp.pdf"))
      .rejects.toThrow("not a PDF");
  });

  it("rejects third-party copies before downloading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadFilingEvidence("https://ipowatch.in/uploads/rhp.pdf"))
      .rejects.toThrow("third-party");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
