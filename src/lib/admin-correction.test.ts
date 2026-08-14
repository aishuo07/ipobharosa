import { describe, expect, it } from "vitest";
import { officialCorrectionData } from "./admin-correction";

describe("official correction mapping", () => {
  it("maps allowlisted official values to typed IPO fields", () => {
    const result = officialCorrectionData([
      { field: "companyName", officialValue: '"Official Industries Ltd"' },
      { field: "lotSize", officialValue: "200" },
      { field: "leadManagers", officialValue: '["Manager B","Manager A"]' },
      { field: "openDate", officialValue: '"2026-08-20"' },
      { field: "rhpUrl", officialValue: '"https://nsearchives.nseindia.com/rhp.pdf"' },
    ]);

    expect(result.data).toMatchObject({
      lotSize: 200,
      leadManagers: ["Manager B", "Manager A"],
      rhpUrl: "https://nsearchives.nseindia.com/rhp.pdf",
    });
    expect(result.data.openDate).toBeInstanceOf(Date);
    expect(result.companyName).toBe("Official Industries Ltd");
    expect(result.fields).toEqual(["companyName", "lotSize", "leadManagers", "openDate", "rhpUrl"]);
  });

  it("refuses unsupported fields and unsafe filing URLs", () => {
    expect(() => officialCorrectionData([{ field: "issueSizeCr", officialValue: "100" }])).toThrow("not correction-enabled");
    expect(() => officialCorrectionData([{ field: "rhpUrl", officialValue: '"https://example.com/rhp.pdf"' }])).toThrow("official filing URL");
  });
});
