import { describe, expect, it } from "vitest";
import { validateApprovalInput, validateRejectionInput } from "./admin-review";

describe("validateApprovalInput", () => {
  it("returns a trimmed sector after both checks", () => {
    expect(validateApprovalInput({ sector: " Engineering ", factsChecked: true, evidenceChecked: true }))
      .toBe("Engineering");
  });

  it("blocks incomplete approval reviews", () => {
    expect(() => validateApprovalInput({ sector: "Engineering", factsChecked: true }))
      .toThrow("Confirm both review checks");
  });
});

describe("validateRejectionInput", () => {
  it("stores a structured reason with optional notes", () => {
    expect(validateRejectionInput({ reason: "Facts do not match the filing", notes: "Listing date differs" }))
      .toBe("Facts do not match the filing: Listing date differs");
  });

  it("requires details for Other", () => {
    expect(() => validateRejectionInput({ reason: "Other" })).toThrow("Add details");
  });
});
