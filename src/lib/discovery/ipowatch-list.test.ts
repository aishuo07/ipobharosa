import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIpoListing, parseListingCloseDate } from "./ipowatch-list";

function rows(prefix: string, count: number, date = "24-26 August") {
  return Array.from({ length: count }, (_, index) =>
    `<tr><td><a href="https://ipowatch.in/${prefix}-${index}-ipo/">${prefix} ${index}</a></td><td>${date}</td></tr>`,
  ).join("");
}

describe("fetchIpoListing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns every mainboard and SME row instead of silently truncating at 20", async () => {
    const html = `
      <table class="tablepress"><thead><tr><th>Company</th></tr></thead><tbody>${rows("Main", 25)}</tbody></table>
      <table class="tablepress"><thead><tr><th>Company</th><th>Platform</th></tr></thead><tbody>${rows("SME", 24)}</tbody></table>
      <table><tbody>${rows("Speculative", 10)}</tbody></table>
    `;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }));

    const candidates = await fetchIpoListing(new Date("2026-08-12T12:00:00Z"));

    expect(candidates).toHaveLength(49);
    expect(candidates.filter((candidate) => candidate.board === "MAINBOARD")).toHaveLength(25);
    expect(candidates.filter((candidate) => candidate.board === "SME")).toHaveLength(24);
    expect(candidates.some((candidate) => candidate.companyName.startsWith("Speculative"))).toBe(false);
  });

  it("excludes stale history while retaining every active, upcoming, and recently closed IPO", async () => {
    const html = `
      <table class="tablepress"><thead><tr><th>Company</th><th>IPO Date</th></tr></thead><tbody>
        ${rows("Upcoming", 2, "24-26 August")}
        ${rows("Recent", 2, "29-31 July")}
        ${rows("Stale", 2, "5-7 May")}
      </tbody></table>
    `;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }));

    const candidates = await fetchIpoListing(new Date("2026-08-12T12:00:00Z"));

    expect(candidates.map((candidate) => candidate.companyName)).toEqual([
      "Upcoming 0", "Upcoming 1", "Recent 0", "Recent 1",
    ]);
  });

  it("retries a transient listing outage before declaring discovery failed", async () => {
    const html = `<table class="tablepress"><thead><tr><th>Company</th></tr></thead><tbody>${rows("Recovered", 1)}</tbody></table>`;
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ ok: true, text: async () => html });
    vi.stubGlobal("fetch", fetchMock);

    const candidates = await fetchIpoListing(new Date("2026-08-12T12:00:00Z"));

    expect(candidates).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("normalizes relative detail links so downstream fact collection can fetch them", async () => {
    const html = `
      <table class="tablepress"><thead><tr><th>Company</th></tr></thead><tbody>
        <tr><td><a href="/relative-company-ipo/">Relative Company</a></td><td>24-26 August</td></tr>
      </tbody></table>
    `;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => html }));

    const candidates = await fetchIpoListing(new Date("2026-08-12T12:00:00Z"));

    expect(candidates[0].detailUrl).toBe("https://ipowatch.in/relative-company-ipo/");
  });

  it("fails loudly when an HTTP 200 response does not contain the IPO tables", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<html>Access check</html>" }));

    await expect(fetchIpoListing(new Date("2026-08-12T12:00:00Z")))
      .rejects.toThrow("expected Mainboard/SME tables were not present");
  });

  it("infers the closest year when the source omits it", () => {
    expect(parseListingCloseDate("30-2 January", new Date("2026-12-28T12:00:00Z"))?.toISOString())
      .toBe("2027-01-02T12:00:00.000Z");
    expect(parseListingCloseDate("24-26 August", new Date("2026-08-12T12:00:00Z"))?.toISOString())
      .toBe("2026-08-26T12:00:00.000Z");
  });
});
