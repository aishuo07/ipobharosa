import { describe, expect, it } from "vitest";
import { publicVerificationFromPublicationState } from "./public-verification";

describe("public IPO verification state", () => {
  it("maps published records with complete official evidence to a verified contract", () => {
    expect(publicVerificationFromPublicationState({
      publicationState: "PUBLISHED",
      officialLastAttemptAt: new Date("2026-08-14T10:00:00Z"),
      officialNextAttemptAt: null,
      quarantineReason: null,
      officialContext: {
        matchedFields: 10,
        materialFields: 10,
        providers: ["NSE"],
        attempts: [],
      },
    })).toMatchObject({
      state: "VERIFIED",
      label: "Automated verification passed",
      checkedAt: "2026-08-14T10:00:00.000Z",
    });
  });

  it("does not call a published record verified when its source evidence is missing", () => {
    expect(publicVerificationFromPublicationState({
      publicationState: "PUBLISHED",
      officialLastAttemptAt: null,
      officialNextAttemptAt: null,
      quarantineReason: null,
    })).toMatchObject({
      state: "PENDING",
      label: "Published · source evidence incomplete",
      shortLabel: "Evidence incomplete",
    });
  });

  it("keeps pending and conflicting records visible without calling them verified", () => {
    expect(publicVerificationFromPublicationState({
      publicationState: "DRAFT",
      officialLastAttemptAt: null,
      officialNextAttemptAt: new Date("2026-08-14T12:00:00Z"),
      quarantineReason: null,
    })).toMatchObject({
      state: "PENDING",
      label: "Automated verification pending",
      nextCheckAt: "2026-08-14T12:00:00.000Z",
    });

    expect(publicVerificationFromPublicationState({
      publicationState: "QUARANTINED",
      officialLastAttemptAt: new Date("2026-08-14T10:00:00Z"),
      officialNextAttemptAt: null,
      quarantineReason: "lotSize differs between discovery and NSE; openDate differs between discovery and NSE",
    })).toMatchObject({
      state: "NEEDS_REVIEW",
      label: "Source mismatch needs review",
      issueSummary: "Lot size and open date differ across sources.",
    });
  });

  it("never creates a public trust contract for rejected records", () => {
    expect(publicVerificationFromPublicationState({
      publicationState: "REJECTED",
      officialLastAttemptAt: null,
      officialNextAttemptAt: null,
      quarantineReason: "rejected",
    })).toBeNull();
  });
});
