import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpoListingCandidate } from "./types";

let listingResult: IpoListingCandidate[] = [];
let existingCompanyNames: string[] = [];
let createdCompanies: { id: string; name: string }[] = [];
let createdIpos: Record<string, unknown>[] = [];
let createdLogs: Record<string, unknown>[] = [];
let unreviewedCount = 0;
let ipoCreateShouldThrow = false;
let factsImpl: (url: string, name: string, board: "MAINBOARD" | "SME") => Promise<unknown>;

vi.mock("./ipowatch-list", () => ({
  fetchIpoListing: async () => listingResult,
}));

vi.mock("./ipowatch-facts", () => ({
  fetchIpoFacts: (...args: [string, string, "MAINBOARD" | "SME"]) => factsImpl(...args),
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
    drhpUrl: "drhpUrl" in overrides ? overrides.drhpUrl : "https://example.com/drhp.pdf",
    rhpUrl: "rhpUrl" in overrides ? overrides.rhpUrl : null,
  };
}

describe("runDiscovery", () => {
  beforeEach(() => {
    listingResult = [];
    existingCompanyNames = [];
    createdCompanies = [];
    createdIpos = [];
    createdLogs = [];
    unreviewedCount = 0;
    ipoCreateShouldThrow = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
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

  it("auto-publishes a candidate that is valid, cross-verified, and has an official document link", async () => {
    listingResult = [{ companyName: "High Confidence Co", detailUrl: "https://ipowatch.in/high-confidence-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("High Confidence Co");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true })); // cross-verified on Sahi

    const summary = await runDiscovery();

    expect(summary.autoPublished).toBe(1);
    expect(summary.draftsCreated).toBe(0);
    expect(createdIpos[0]).toMatchObject({ publicationState: "PUBLISHED", autoPublished: true });
    expect(createdLogs).toHaveLength(1);
    expect(createdLogs[0]).toMatchObject({ action: "auto-publish" });
  });

  it("holds a valid but not-cross-verified candidate as a draft, not auto-published", async () => {
    listingResult = [{ companyName: "Solo Source Co", detailUrl: "https://ipowatch.in/solo-source-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("Solo Source Co");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false })); // not on Sahi

    const summary = await runDiscovery();

    expect(summary.draftsCreated).toBe(1);
    expect(summary.autoPublished).toBe(0);
    expect(createdIpos[0]).toMatchObject({ publicationState: "DRAFT", autoPublished: false });
    expect(createdLogs).toHaveLength(0);
  });

  it("holds a cross-verified candidate with no official document link as a draft, not auto-published", async () => {
    listingResult = [{ companyName: "No Doc Co", detailUrl: "https://ipowatch.in/no-doc-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("No Doc Co", { drhpUrl: null, rhpUrl: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const summary = await runDiscovery();

    expect(summary.draftsCreated).toBe(1);
    expect(summary.autoPublished).toBe(0);
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
    expect(summary.draftsCreated + summary.autoPublished + summary.quarantined).toBe(1);
  });
});
