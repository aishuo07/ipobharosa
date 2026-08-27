import { describe, expect, it } from "vitest";
import { findIpoTrackGmp } from "./ipotrack";

const payload = `
<script>self.__next_f.push([1,"38:[\\"$\\",\\"tr\\",\\"cms8qrkfe01ppgdlsv48eg4q2\\",{\\"className\\":\\"border-b\\",\\"children\\":[[\\"$\\",\\"td\\",null,{\\"className\\":\\"px-4\\",\\"children\\":[\\"$\\",\\"$L27\\",null,{\\"title\\":\\"Shiprocket\\",\\"url\\":\\"https://ipotrack.in/ipo/shiprocket\\",\\"gmp\\":\\"₹33\\",\\"gain\\":\\"34.02%\\",\\"compact\\":true}]}]]}]\\n"])</script>
<script>self.__next_f.push([1,"39:[\\"$\\",\\"tr\\",\\"null\\",{\\"children\\":[\\"$\\",\\"$L27\\",null,{\\"title\\":\\"Behari Lal Engineering\\",\\"url\\":\\"https://ipotrack.in/ipo/behari-lal-engineering\\",\\"gmp\\":\\"105\\",\\"gain\\":\\"36.84%\\",\\"compact\\":true}]}]]}]\\n"])</script>
`;

describe("findIpoTrackGmp", () => {
  it("extracts a rupee-formatted quote by exact company name", () => {
    expect(findIpoTrackGmp("Shiprocket Ltd", payload)).toEqual({ kind: "VALUE", value: 33 });
  });

  it("extracts a bare-number quote and normalizes the company name", () => {
    expect(findIpoTrackGmp("Behari Lal Engineering", payload)).toEqual({ kind: "VALUE", value: 105 });
  });

  it("reports NOT_COVERED when the company has no row", () => {
    const result = findIpoTrackGmp("Milky Mist Dairy Food Ltd", payload);
    expect(result.kind).toBe("NOT_COVERED");
  });
});