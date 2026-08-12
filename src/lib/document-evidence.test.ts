import { describe, expect, it } from "vitest";
import { filingEvidenceClass, filingEvidenceLabel, filingSourceHost } from "./document-evidence";

describe("filing evidence classification", () => {
  it("recognizes exchange and SEBI hosts as official", () => {
    expect(filingEvidenceClass("https://www.bseindia.com/corporates/file.pdf")).toBe("OFFICIAL");
    expect(filingEvidenceClass("https://nsearchives.nseindia.com/corporate/file.pdf")).toBe("OFFICIAL");
    expect(filingEvidenceClass("https://www.sebi.gov.in/filings/file.pdf")).toBe("OFFICIAL");
  });

  it("does not call aggregator-hosted copies official", () => {
    const url = "https://ipowatch.in/wp-content/uploads/rhp.pdf";
    expect(filingEvidenceClass(url)).toBe("THIRD_PARTY");
    expect(filingEvidenceLabel(url)).toBe("Third-party hosted filing copy");
  });

  it("labels other filing hosts conservatively and exposes the exact host", () => {
    const url = "https://www.axiscapital.co.in/contents/rhp.pdf";
    expect(filingEvidenceClass(url)).toBe("ISSUER_OR_MANAGER");
    expect(filingSourceHost(url)).toBe("axiscapital.co.in");
  });
});
