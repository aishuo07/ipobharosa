import { afterEach, describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { downloadFilingEvidence, selectFilingPdfEntry } from "./filing-evidence";

afterEach(() => vi.unstubAllGlobals());

describe("downloadFilingEvidence", () => {
  it("hashes the exact PDF bytes from an official source", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(Buffer.from("%PDF-test-evidence"), {
      status: 200, headers: { "content-type": "application/pdf" },
    })));
    const result = await downloadFilingEvidence("https://www.bseindia.com/corporates/rhp.pdf");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.byteLength).toBe(18);
    expect(result).toMatchObject({ contentType: "application/pdf", sourceFormat: "PDF" });
  });

  it("extracts and hashes the requested filing from an official ZIP", async () => {
    const drhp = Buffer.from("%PDF-draft-filing");
    const rhp = Buffer.from("%PDF-final-filing");
    const archive = zipSync({ "docs/company_DRHP.pdf": drhp, "docs/company_RHP.pdf": rhp, "readme.txt": Buffer.from("ignore") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(archive, {
      status: 200, headers: { "content-type": "application/zip" },
    })));
    const result = await downloadFilingEvidence("https://nsearchives.nseindia.com/company.zip", "RHP");
    expect(result).toMatchObject({
      byteLength: rhp.byteLength,
      contentType: "application/pdf",
      sourceFormat: "ZIP",
      archiveEntry: "docs/company_RHP.pdf",
    });
  });

  it("rejects an archive when the requested filing is ambiguous", () => {
    expect(() => selectFilingPdfEntry({
      "one_RHP.pdf": Buffer.from("%PDF-one"),
      "two_RHP.pdf": Buffer.from("%PDF-two"),
    }, "RHP")).toThrow("ambiguous RHP");
  });

  it("uses a single valid PDF as a safe filename-independent fallback", () => {
    expect(selectFilingPdfEntry({ "prospectus.pdf": Buffer.from("%PDF-one") }, "RHP").name)
      .toBe("prospectus.pdf");
  });

  it("rejects ZIP archives beyond the bounded entry count", async () => {
    const entries = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [
      `entry-${index}.txt`, Buffer.from("ignored"),
    ]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(zipSync(entries), { status: 200 })));
    await expect(downloadFilingEvidence("https://nsearchives.nseindia.com/too-many.zip", "RHP"))
      .rejects.toThrow("100 entry safety limit");
  });

  it("rejects HTML masquerading as a filing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>blocked</html>", { status: 200 })));
    await expect(downloadFilingEvidence("https://nsearchives.nseindia.com/rhp.pdf"))
      .rejects.toThrow("neither a PDF nor a ZIP");
  });

  it("rejects third-party copies before downloading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadFilingEvidence("https://ipowatch.in/uploads/rhp.pdf"))
      .rejects.toThrow("third-party");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
