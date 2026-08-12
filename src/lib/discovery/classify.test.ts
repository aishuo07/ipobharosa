import { describe, expect, it } from "vitest";
import { classifyCandidate } from "./classify";

describe("classifyCandidate", () => {
  it("quarantines anything with validation problems, regardless of source agreement", () => {
    expect(
      classifyCandidate({ validationProblems: ["bad dates"], crossVerified: true, hasOfficialDocument: true }),
    ).toBe("QUARANTINE");
  });

  it("auto-publishes only when valid, cross-verified, and an official document is present", () => {
    expect(
      classifyCandidate({ validationProblems: [], crossVerified: true, hasOfficialDocument: true }),
    ).toBe("HIGH");
  });

  it("holds as a draft when valid but not cross-verified", () => {
    expect(
      classifyCandidate({ validationProblems: [], crossVerified: false, hasOfficialDocument: true }),
    ).toBe("MEDIUM");
  });

  it("holds as a draft when valid and cross-verified but no official document link", () => {
    expect(
      classifyCandidate({ validationProblems: [], crossVerified: true, hasOfficialDocument: false }),
    ).toBe("MEDIUM");
  });

  it("holds as a draft when neither extra confirmation is present", () => {
    expect(
      classifyCandidate({ validationProblems: [], crossVerified: false, hasOfficialDocument: false }),
    ).toBe("MEDIUM");
  });
});
