import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpoListingCandidate } from "./types";
import type { OfficialEvidenceResult } from "./official/types";

let listingResult: IpoListingCandidate[] = [];
let existingCompanyNames: string[] = [];
let createdCompanies: { id: string; name: string }[] = [];
let createdIpos: Record<string, unknown>[] = [];
let createdLogs: Record<string, unknown>[] = [];
let createdDocuments: Record<string, unknown>[] = [];
let unreviewedCount = 0;
let ipoCreateShouldThrow = false;
let discoveryAttempts: Array<{ sourceUrl: string; companyName: string; attempts: number; lastAttemptAt: Date; nextAttemptAt: Date; lastError: string }> = [];
let factsImpl: (url: string, name: string, board: "MAINBOARD" | "SME") => Promise<unknown>;
let officialImpl: (name: string) => Promise<unknown>;
let autoPublishEnabled = true;

vi.mock("./ipowatch-list", () => ({
  fetchIpoListing: async () => listingResult,
}));

vi.mock("./ipowatch-facts", () => ({
  fetchIpoFacts: (...args: [string, string, "MAINBOARD" | "SME"]) => factsImpl(...args),
}));

vi.mock("./official", () => ({
  fetchOfficialIpoEvidence: (name: string) => officialImpl(name),
}));

vi.mock("./official/persistence", () => ({
  officialAutoPublishEnabled: () => autoPublishEnabled,
  persistOfficialDecision: async () => undefined,
}));

function makeTx() {
  return {
    company: {
      create: async ({ data }: { data: { name: string } }) => {
        const company = { id: `company-${createdCompanies.length}`, ...data };
        createdCompanies.push(company);
        return company;
      },
    },
    ipo: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (ipoCreateShouldThrow) throw new Error("simulated database write failure");
        createdIpos.push(data);
        return { id: `ipo-${createdIpos.length}`, ...data };
      },
    },
    correctionLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdLogs.push(data);
        return data;
      },
    },
    document: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        createdDocuments.push(...data);
        return { count: data.length };
      },
    },
    officialEvidenceCapture: { create: async () => undefined },
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findMany: async () => existingCompanyNames.map((name) => ({ name })),
    },
    ipo: {
      count: async () => unreviewedCount,
    },
    discoveryAttempt: {
      findMany: async ({ where }: { where: { sourceUrl: { in: string[] } } }) =>
        discoveryAttempts.filter((attempt) => where.sourceUrl.in.includes(attempt.sourceUrl)),
      upsert: async ({ where, create, update }: { where: { sourceUrl: string }; create: typeof discoveryAttempts[number]; update: Partial<typeof discoveryAttempts[number]> }) => {
        const index = discoveryAttempts.findIndex((attempt) => attempt.sourceUrl === where.sourceUrl);
        if (index === -1) discoveryAttempts.push(create);
        else discoveryAttempts[index] = { ...discoveryAttempts[index], ...update };
      },
      deleteMany: async ({ where }: { where: { sourceUrl: string } }) => {
        discoveryAttempts = discoveryAttempts.filter((attempt) => attempt.sourceUrl !== where.sourceUrl);
      },
    },
    $transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<void>) => fn(makeTx()),
  },
}));

const { runDiscovery } = await import("./discover");

function validFacts(
  companyName: string,
  overrides: { board?: "MAINBOARD" | "SME"; drhpUrl?: string | null; rhpUrl?: string | null } = {},
) {
  return {
    companyName,
    board: overrides.board ?? "MAINBOARD",
    priceBandLow: 100,
    priceBandHigh: 110,
    lotSize: 130,
    issueSizeCr: 500,
    freshIssueCr: 400,
    ofsCr: 100,
    openDate: new Date("2026-08-18"),
    closeDate: new Date("2026-08-20"),
    allotmentDate: new Date("2026-08-21"),
    refundDate: new Date("2026-08-24"),
    listingDate: new Date("2026-08-25"),
    registrar: "Kfin Technologies Ltd.",
    leadManagers: ["Some Bank Ltd"],
    // `??` would treat an explicitly-passed `null` the same as "not
    // provided" and fall through to the default — `"key" in overrides`
    // is needed to let tests deliberately pass null.
    drhpUrl: "drhpUrl" in overrides ? overrides.drhpUrl : "https://www.bseindia.com/corporates/drhp.pdf",
    rhpUrl: "rhpUrl" in overrides ? overrides.rhpUrl : null,
  };
}

function matchingOfficialEvidence(facts: ReturnType<typeof validFacts>): Extract<OfficialEvidenceResult, { status: "FOUND" }> {
  const sourceUrl = "https://www.nseindia.com/market-data/issue-information?series=EQ&symbol=TEST&type=Active";
  return {
    status: "FOUND",
    evidence: {
      source: "NSE",
      sourceUrl,
      capturedAt: new Date("2026-08-12T12:00:00Z"),
      raw: {},
      facts: {
        companyName: facts.companyName,
        board: facts.board,
        priceBandLow: facts.priceBandLow,
        priceBandHigh: facts.priceBandHigh,
        lotSize: facts.lotSize,
        openDate: facts.openDate,
        closeDate: facts.closeDate,
        registrar: facts.registrar,
        leadManagers: facts.leadManagers,
        rhpUrl: "https://nsearchives.nseindia.com/content/ipo/RHP_TEST.zip",
      },
      fieldSources: {},
    },
  };
}

describe("runDiscovery", () => {
  beforeEach(() => {
    listingResult = [];
    existingCompanyNames = [];
    createdCompanies = [];
    createdIpos = [];
    createdLogs = [];
    createdDocuments = [];
    unreviewedCount = 0;
    ipoCreateShouldThrow = false;
    discoveryAttempts = [];
    autoPublishEnabled = true;
    officialImpl = async (name) => matchingOfficialEvidence(validFacts(name));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips a candidate whose company is already tracked, regardless of publication state", async () => {
    listingResult = [{ companyName: "Shiprocket Ltd", detailUrl: "https://ipowatch.in/shiprocket-ipo/", board: "MAINBOARD" }];
    existingCompanyNames = ["Shiprocket Ltd"];
    factsImpl = vi.fn();

    const summary = await runDiscovery();

    expect(summary.alreadyTracked).toBe(1);
    expect(summary.draftsCreated + summary.autoPublished + summary.quarantined).toBe(0);
    expect(factsImpl).not.toHaveBeenCalled();
  });

  it("recognizes a shortened listing-page display name as already tracked", async () => {
    listingResult = [{ companyName: "Milky Mist", detailUrl: "https://ipowatch.in/milky-mist-dairy-food-ipo/", board: "MAINBOARD" }];
    existingCompanyNames = ["Milky Mist Dairy Food Ltd"];
    factsImpl = vi.fn();

    const summary = await runDiscovery();

    expect(summary.alreadyTracked).toBe(1);
    expect(factsImpl).not.toHaveBeenCalled();
  });

  it("does not treat unrelated short company names as a containment match", async () => {
    listingResult = [{ companyName: "GV Industries", detailUrl: "https://ipowatch.in/gv-industries-ipo/", board: "MAINBOARD" }];
    existingCompanyNames = ["G V Ltd"]; // slug "g-v" — too short to safely use containment matching
    factsImpl = async () => validFacts("GV Industries");

    const summary = await runDiscovery();

    expect(summary.alreadyTracked).toBe(0);
    expect(summary.draftsCreated + summary.autoPublished).toBe(1);
  });

  it("auto-publishes a candidate only after all material NSE fields agree", async () => {
    listingResult = [{ companyName: "High Confidence Co", detailUrl: "https://ipowatch.in/high-confidence-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("High Confidence Co");

    const summary = await runDiscovery();

    expect(summary.autoPublished).toBe(1);
    expect(summary.draftsCreated).toBe(0);
    expect(createdIpos[0]).toMatchObject({ publicationState: "PUBLISHED", autoPublished: true });
    expect(createdLogs).toHaveLength(1);
    expect(createdLogs[0]).toMatchObject({ action: "auto-publish" });
    expect(createdDocuments).toEqual([
      expect.objectContaining({ docType: "drhp", url: "https://www.bseindia.com/corporates/drhp.pdf" }),
      expect.objectContaining({ docType: "rhp", url: "https://nsearchives.nseindia.com/content/ipo/RHP_TEST.zip" }),
    ]);
  });

  it("holds an eligible matching candidate when the production feature flag is disabled", async () => {
    listingResult = [{ companyName: "Flagged Co", detailUrl: "https://ipowatch.in/flagged-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("Flagged Co");
    autoPublishEnabled = false;

    const summary = await runDiscovery();

    expect(summary.draftsCreated).toBe(1);
    expect(summary.autoPublished).toBe(0);
    expect(createdIpos[0]).toMatchObject({ publicationState: "DRAFT", autoPublished: false });
    expect(createdLogs).toHaveLength(0);
  });

  it("labels an archived final offer document as a Prospectus rather than an RHP", async () => {
    listingResult = [{ companyName: "Teja Engineering", detailUrl: "https://ipowatch.in/teja-engineering-ipo/", board: "SME" }];
    factsImpl = async () => validFacts("Teja Engineering", { board: "SME" });
    officialImpl = async (name) => {
      const result = matchingOfficialEvidence(validFacts(name, { board: "SME" }));
      result.evidence.facts.rhpUrl = "https://nsearchives.nseindia.com/content/ipo/PROSPECTUS_TEJA.zip";
      return result;
    };

    const summary = await runDiscovery();

    expect(summary.autoPublished).toBe(1);
    expect(createdDocuments).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Official Prospectus", url: "https://nsearchives.nseindia.com/content/ipo/PROSPECTUS_TEJA.zip" }),
    ]));
  });

  it("retries when the official source omits a material document link", async () => {
    listingResult = [{ companyName: "No Doc Co", detailUrl: "https://ipowatch.in/no-doc-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("No Doc Co", { drhpUrl: null, rhpUrl: null });
    officialImpl = async (name) => {
      const result = matchingOfficialEvidence(validFacts(name));
      result.evidence.facts.rhpUrl = null;
      return result;
    };

    const summary = await runDiscovery();

    expect(summary.fetchFailed).toHaveLength(1);
    expect(summary.autoPublished).toBe(0);
  });

  it("routes a material NSE conflict to quarantine", async () => {
    listingResult = [{ companyName: "Copied Filing Co", detailUrl: "https://ipowatch.in/copied-filing-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("Copied Filing Co", { drhpUrl: null, rhpUrl: "https://ipowatch.in/wp-content/rhp.pdf" });
    officialImpl = async (name) => {
      const result = matchingOfficialEvidence(validFacts(name));
      result.evidence.facts.lotSize = 999;
      return result;
    };

    const summary = await runDiscovery();

    expect(summary.quarantined).toBe(1);
    expect(summary.autoPublished).toBe(0);
    expect(createdIpos[0].quarantineReason).toContain("lotSize differs");
  });

  it("quarantines a candidate with inconsistent data instead of discarding it silently", async () => {
    listingResult = [{ companyName: "Broken Data Co", detailUrl: "https://ipowatch.in/broken-data-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => ({ ...validFacts("Broken Data Co"), priceBandLow: 200, priceBandHigh: 100 });

    const summary = await runDiscovery();

    expect(summary.quarantined).toBe(1);
    expect(summary.draftsCreated).toBe(0);
    expect(summary.autoPublished).toBe(0);
    expect(createdIpos[0]).toMatchObject({ publicationState: "QUARANTINED" });
    expect(createdIpos[0].quarantineReason).toContain("price band low");
  });

  it("records a fetch failure without throwing or creating a row", async () => {
    listingResult = [{ companyName: "Unreachable Co", detailUrl: "https://ipowatch.in/unreachable-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => {
      throw new Error("ipowatch facts: HTTP 500");
    };

    const summary = await runDiscovery();

    expect(summary.fetchFailed).toHaveLength(1);
    expect(createdIpos).toHaveLength(0);
  });

  it("records a database write failure without crashing the whole run", async () => {
    listingResult = [
      { companyName: "First Co", detailUrl: "https://ipowatch.in/first-co-ipo/", board: "MAINBOARD" },
      { companyName: "Second Co", detailUrl: "https://ipowatch.in/second-co-ipo/", board: "MAINBOARD" },
    ];
    factsImpl = async (_url, name) => validFacts(name);
    ipoCreateShouldThrow = true;

    const summary = await runDiscovery();

    expect(summary.dbErrors).toHaveLength(2);
    expect(createdIpos).toHaveLength(0);
  });

  it("doesn't double-create when the same company appears twice in one listing pull", async () => {
    listingResult = [
      { companyName: "Duplicate Row Co", detailUrl: "https://ipowatch.in/duplicate-row-co-ipo/", board: "MAINBOARD" },
      { companyName: "Duplicate Row Co", detailUrl: "https://ipowatch.in/duplicate-row-co-ipo/", board: "MAINBOARD" },
    ];
    factsImpl = async () => validFacts("Duplicate Row Co");

    const summary = await runDiscovery();

    expect(summary.draftsCreated + summary.autoPublished).toBe(1);
    expect(createdIpos).toHaveLength(1);
  });

  it("skips the entire run when the unreviewed queue is already at capacity", async () => {
    unreviewedCount = 100;
    listingResult = [{ companyName: "New Co", detailUrl: "https://ipowatch.in/new-co-ipo/", board: "MAINBOARD" }];
    factsImpl = vi.fn();

    const summary = await runDiscovery();

    expect(summary.queueCapped).toBe(true);
    expect(summary.candidatesSeen).toBe(0);
    expect(factsImpl).not.toHaveBeenCalled();
  });

  it("caps mid-run once the queue fills up partway through", async () => {
    unreviewedCount = 99;
    listingResult = [
      { companyName: "Alpha Ventures", detailUrl: "https://ipowatch.in/alpha-ventures-ipo/", board: "MAINBOARD" },
      { companyName: "Zenith Traders", detailUrl: "https://ipowatch.in/zenith-traders-ipo/", board: "MAINBOARD" },
    ];
    factsImpl = async (_url, name) => validFacts(name);

    const summary = await runDiscovery();

    expect(summary.queueCapped).toBe(true);
    expect(summary.deferredCandidates).toBe(1);
    expect(summary.draftsCreated + summary.autoPublished + summary.quarantined).toBe(1);
  });

  it("processes a bounded batch and reports the remaining candidates", async () => {
    const suffixes = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima", "Mike"];
    listingResult = suffixes.map((suffix) => ({
      companyName: `Candidate ${suffix}`,
      detailUrl: `https://ipowatch.in/candidate-${suffix.toLowerCase()}-ipo/`,
      board: "MAINBOARD" as const,
    }));
    factsImpl = async (_url, name) => validFacts(name);

    const summary = await runDiscovery();

    expect(summary.candidatesSeen).toBe(13);
    expect(summary.draftsCreated + summary.autoPublished + summary.quarantined).toBe(10);
    expect(summary.deferredCandidates).toBe(3);
    expect(summary.queueCapped).toBe(false);
  });

  it("backs off a failed candidate so fresh candidates advance next cycle", async () => {
    listingResult = [
      { companyName: "Broken Source", detailUrl: "https://ipowatch.in/broken-source-ipo/", board: "MAINBOARD" },
      { companyName: "Fresh Source", detailUrl: "https://ipowatch.in/fresh-source-ipo/", board: "MAINBOARD" },
    ];
    factsImpl = async (_url, name) => {
      if (name === "Broken Source") throw new Error("upstream timeout");
      return validFacts(name);
    };

    const first = await runDiscovery();
    const second = await runDiscovery();

    expect(first.fetchFailed).toHaveLength(1);
    expect(discoveryAttempts).toEqual([expect.objectContaining({ companyName: "Broken Source", attempts: 1 })]);
    expect(second.fetchFailed).toHaveLength(0);
    expect(second.draftsCreated + second.autoPublished).toBe(1);
  });

  it("retries a failed candidate after its backoff expires", async () => {
    listingResult = [{ companyName: "Recovered Source", detailUrl: "https://ipowatch.in/recovered-source-ipo/", board: "MAINBOARD" }];
    discoveryAttempts = [{
      sourceUrl: listingResult[0].detailUrl,
      companyName: listingResult[0].companyName,
      attempts: 2,
      lastAttemptAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      nextAttemptAt: new Date(Date.now() - 1000),
      lastError: "old timeout",
    }];
    factsImpl = async (_url, name) => validFacts(name);

    const summary = await runDiscovery();

    expect(summary.draftsCreated + summary.autoPublished).toBe(1);
    expect(discoveryAttempts).toEqual([]);
  });
});
