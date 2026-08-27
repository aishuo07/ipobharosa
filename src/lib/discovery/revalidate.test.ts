import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  documentFindFirst: vi.fn(),
  documentCreate: vi.fn(),
  correctionCreate: vi.fn(),
  persistDecision: vi.fn(),
  persistIncident: vi.fn(),
  fetchEvidence: vi.fn(),
  sourceSuccess: vi.fn(),
  sourceFailure: vi.fn(),
  autoPublish: false,
}));

const tx = vi.hoisted(() => ({
  ipo: { update: mocks.update },
  document: { findFirst: mocks.documentFindFirst, create: mocks.documentCreate },
  correctionLog: { create: mocks.correctionCreate },
  officialEvidenceIncident: { upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ipo: { findFirst: mocks.findFirst, update: mocks.update, count: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("./official", () => ({ fetchOfficialIpoEvidence: mocks.fetchEvidence }));
vi.mock("./official/persistence", () => ({
  officialAutoPublishEnabled: () => mocks.autoPublish,
  persistOfficialDecision: mocks.persistDecision,
  persistOfficialIncident: mocks.persistIncident,
}));
vi.mock("@/lib/ingestion/source-operation", () => ({
  recordSourceSuccess: mocks.sourceSuccess,
  recordSourceFailure: mocks.sourceFailure,
}));

import { nextOfficialConflictCheckAt, revalidateCandidateById, revalidateOldestCandidate } from "./revalidate";

function decimal(value: number) {
  return { toNumber: () => value };
}

function candidate() {
  return {
    id: "ipo-1",
    publicationState: "DRAFT" as const,
    board: "SME" as const,
    priceBandLow: decimal(220),
    priceBandHigh: decimal(220),
    lotSize: 600,
    issueSizeCr: decimal(37.36),
    freshIssueCr: decimal(37.36),
    ofsCr: null,
    openDate: new Date("2026-06-30T00:00:00Z"),
    closeDate: new Date("2026-07-02T00:00:00Z"),
    allotmentDate: new Date("2026-07-03T00:00:00Z"),
    refundDate: new Date("2026-07-06T00:00:00Z"),
    listingDate: new Date("2026-07-07T00:00:00Z"),
    registrar: "Kfin Technologies Limited",
    leadManagers: ["Interactive Financial Services Limited"],
    drhpUrl: null,
    rhpUrl: null,
    reviewedAt: null,
    quarantineReason: null,
    officialCheckAttempts: 0,
    officialNextAttemptAt: null,
    company: { name: "Teja Engineering" },
  };
}

function matchingEvidence() {
  return {
    status: "FOUND" as const,
    evidence: {
      source: "NSE" as const,
      sourceUrl: "https://www.nseindia.com/market-data/issue-information?series=SME&symbol=TEJA&type=Past",
      capturedAt: new Date("2026-08-13T00:00:00Z"),
      facts: {
        companyName: "Teja Engineering Industries Limited",
        board: "SME" as const,
        priceBandLow: 220,
        priceBandHigh: 220,
        lotSize: 600,
        openDate: new Date("2026-06-30T00:00:00Z"),
        closeDate: new Date("2026-07-02T00:00:00Z"),
        registrar: "Kfin Technologies Limited",
        leadManagers: ["Interactive Financial Services Limited"],
        rhpUrl: "https://nsearchives.nseindia.com/content/ipo/PROSPECTUS_TEJA.zip",
      },
      fieldSources: {},
      raw: {},
    },
  };
}

describe("automatic official revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.autoPublish = false;
    mocks.findFirst.mockResolvedValue(candidate());
    mocks.fetchEvidence.mockResolvedValue(matchingEvidence());
    mocks.documentFindFirst.mockResolvedValue(null);
  });

  it("records eligibility but keeps the draft unpublished when the feature flag is off", async () => {
    const result = await revalidateOldestCandidate();

    expect(result.outcome).toBe("ELIGIBLE_HELD");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publicationState: "DRAFT", autoPublished: false }),
    }));
    expect(mocks.persistDecision).toHaveBeenCalledOnce();
    expect(mocks.documentCreate).not.toHaveBeenCalled();
    expect(mocks.correctionCreate).not.toHaveBeenCalled();
  });

  it("publishes, cites and audits a fully matching archived SME when the flag is on", async () => {
    mocks.autoPublish = true;

    const result = await revalidateOldestCandidate();

    expect(result.outcome).toBe("PUBLISHED");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publicationState: "PUBLISHED", autoPublished: true, rhpUrl: expect.stringContaining("PROSPECTUS_TEJA") }),
    }));
    expect(mocks.documentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ label: "Official Prospectus" }) });
    expect(mocks.correctionCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ performedBy: "official-revalidation" }) });
  });

  it("moves an incomplete stored candidate to the exception queue without calling NSE", async () => {
    mocks.findFirst.mockResolvedValue({ ...candidate(), registrar: null });

    const result = await revalidateOldestCandidate();

    expect(result.outcome).toBe("INVALID");
    expect(mocks.fetchEvidence).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      publicationState: "QUARANTINED",
      officialLastAttemptAt: expect.any(Date),
      officialNextAttemptAt: expect.any(Date),
    }) }));
  });

  it("schedules a conflict cooldown instead of retrying the same exception every cycle", async () => {
    const evidence = matchingEvidence();
    mocks.fetchEvidence.mockResolvedValue({
      ...evidence,
      evidence: { ...evidence.evidence, facts: { ...evidence.evidence.facts, lotSize: 1200 } },
    });

    const before = Date.now();
    const result = await revalidateOldestCandidate();

    expect(result.outcome).toBe("EXCEPTION");
    const update = mocks.update.mock.calls[0][0].data;
    expect(update.publicationState).toBe("QUARANTINED");
    expect(update.officialNextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1_000);
    expect(mocks.persistIncident).toHaveBeenCalledOnce();
  });

  it("revalidates a specific retryable IPO without changing queue timestamps first", async () => {
    const result = await revalidateCandidateById("ipo-1");

    expect(result.outcome).toBe("ELIGIBLE_HELD");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ipo-1", publicationState: { in: ["DRAFT", "QUARANTINED"] } },
    }));
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("does not retry an IPO outside the unpublished retry states", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const result = await revalidateCandidateById("published-ipo");

    expect(result.outcome).toBe("EMPTY");
    expect(mocks.fetchEvidence).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("removes an officially classified FPO from the IPO queue", async () => {
    mocks.fetchEvidence.mockResolvedValue({
      evidence: [],
      attempts: [{ source: "BSE", status: "WRONG_ISSUE_TYPE", reason: "BSE classifies this as FPO, not IPO", issueType: "FPO", sourceUrl: "https://api.bseindia.com/detail" }],
    });

    const result = await revalidateOldestCandidate();

    expect(result.outcome).toBe("WRONG_TYPE");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publicationState: "REJECTED", officialIssueType: "FPO" }),
    }));
  });

  it("calculates the conflict retry window deterministically", () => {
    expect(nextOfficialConflictCheckAt(new Date("2026-08-15T00:00:00Z"))).toEqual(new Date("2026-08-16T00:00:00Z"));
  });
});
