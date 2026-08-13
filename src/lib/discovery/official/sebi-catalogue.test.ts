import { describe, expect, it } from "vitest";
import { parseSebiFilingPage } from "./sebi-catalogue";

const html = `
  <table id="sample_1"><tbody>
    <tr><td>Aug 11, 2026</td><td>
      <a class="points" href="https://www.sebi.gov.in/filings/public-issues/aug-2026/beauty-garage-limited-drhp_103479.html"
        title="BEAUTY GARAGE LIMITED - DRHP<br><a href='https://www.sebi.gov.in/sebi_data/commondocs/beauty.pdf'>Draft Abridged Prospectus</a>">
        BEAUTY GARAGE LIMITED - DRHP
      </a>
    </td></tr>
    <tr><td>Aug 03, 2026</td><td>
      <a class="points" href="https://www.sebi.gov.in/filings/public-issues/aug-2026/hero-motors-limited-corrigendum-to-drhp_103180.html"
        title="Hero Motors Limited - Corrigendum to DRHP">Hero Motors Limited - Corrigendum to DRHP</a>
    </td></tr>
  </tbody></table>`;

describe("SEBI official filing catalogue", () => {
  it("turns official rows into normalized catalogue entries", () => {
    const entries = parseSebiFilingPage(html, "DRHP_FILED");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      companyName: "Beauty Garage Limited",
      issuerKey: "beauty garage",
      stage: "DRHP_FILED",
      source: "SEBI",
      documentUrl: "https://www.sebi.gov.in/sebi_data/commondocs/beauty.pdf",
    });
    expect(entries[0].filingDate.toISOString()).toBe("2026-08-11T00:00:00.000Z");
  });

  it("keeps corrigenda attached to the issuer instead of creating fake companies", () => {
    const [entry] = parseSebiFilingPage(html, "DRHP_FILED").slice(1);
    expect(entry.companyName).toBe("Hero Motors Limited");
    expect(entry.issuerKey).toBe("hero motors");
  });

  it("removes updated-DRHP revision labels from issuer names", () => {
    const revised = `<table id="sample_1"><tbody><tr><td>Jun 30, 2026</td><td><a class="points" href="https://www.sebi.gov.in/filings/public-issues/oravel.html" title="ORAVEL STAYS LIMITED UDRHP-I">ORAVEL</a></td></tr></tbody></table>`;
    expect(parseSebiFilingPage(revised, "DRHP_FILED")[0]).toMatchObject({
      companyName: "Oravel Stays Limited",
      issuerKey: "oravel stays",
    });
  });

  it("uses the document title when SEBI places an RHP on the DRHP category page", () => {
    const misplaced = `<table id="sample_1"><tbody><tr><td>Aug 3, 2026</td><td><a class="points" href="https://www.sebi.gov.in/filings/public-issues/veritas.html" title="Veritas Finance Limited - RHP">Veritas</a></td></tr></tbody></table>`;
    expect(parseSebiFilingPage(misplaced, "DRHP_FILED")[0].stage).toBe("RHP_FILED");
  });

  it("does not leak addendum or corrigendum labels into the company name", () => {
    const addendum = `<table id="sample_1"><tbody><tr><td>Aug 7, 2026</td><td><a class="points" href="https://www.sebi.gov.in/filings/public-issues/leap.html" title="LEAP INDIA LIMITED - Addendum cum Corrigendum">LEAP</a></td></tr></tbody></table>`;
    expect(parseSebiFilingPage(addendum, "RHP_FILED")[0].companyName).toBe("Leap India Limited");
  });
});
