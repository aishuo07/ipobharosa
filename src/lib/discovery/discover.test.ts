import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpoListingCandidate } from "./types";

let listingResult: IpoListingCandidate[] = [];
let existingCompanyNames: string[] = [];
let createdIpos: Record<string, unknown>[] = [];
let factsImpl: (url: string, name: string, board: "MAINBOARD" | "SME") => Promise<unknown>;

vi.mock("./ipowatch-list", () => ({
  fetchIpoListing: async () => listingResult,
}));

vi.mock("./ipowatch-facts", () => ({
  fetchIpoFacts: (...args: [string, string, "MAINBOARD" | "SME"]) => factsImpl(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findMany: async () => existingCompanyNames.map((name) => ({ name })),
      create: async ({ data }: { data: { name: string } }) => ({ id: `company-${data.name}`, ...data }),
    },
    ipo: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdIpos.push(data);
        return { id: `ipo-${createdIpos.length}`, ...data };
      },
    },
  },
}));

const { runDiscovery } = await import("./discover");

function validFacts(companyName: string, board: "MAINBOARD" | "SME" = "MAINBOARD") {
  return {
    companyName,
    board,
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
  };
}

describe("runDiscovery", () => {
  beforeEach(() => {
    listingResult = [];
    existingCompanyNames = [];
    createdIpos = [];
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
    expect(summary.draftsCreated).toBe(0);
    expect(factsImpl).not.toHaveBeenCalled();
  });

  it("recognizes a shortened listing-page display name as already tracked", async () => {
    // Real bug: the listing page showed "Milky Mist" while our record has
    // the full legal name "Milky Mist Dairy Food Ltd" — an exact slug
    // match missed this and created a duplicate.
    listingResult = [{ companyName: "Milky Mist", detailUrl: "https://ipowatch.in/milky-mist-dairy-food-ipo/", board: "MAINBOARD" }];
    existingCompanyNames = ["Milky Mist Dairy Food Ltd"];
    factsImpl = vi.fn();

    const summary = await runDiscovery();

    expect(summary.alreadyTracked).toBe(1);
    expect(summary.draftsCreated).toBe(0);
    expect(factsImpl).not.toHaveBeenCalled();
  });

  it("does not treat unrelated short company names as a containment match", async () => {
    listingResult = [{ companyName: "GV Industries", detailUrl: "https://ipowatch.in/gv-industries-ipo/", board: "MAINBOARD" }];
    existingCompanyNames = ["G V Ltd"]; // slug "g-v" — too short to safely use containment matching
    factsImpl = async () => validFacts("GV Industries");

    const summary = await runDiscovery();

    expect(summary.alreadyTracked).toBe(0);
    expect(summary.draftsCreated).toBe(1);
  });

  it("creates a DRAFT ipo for a genuinely new, valid candidate", async () => {
    listingResult = [{ companyName: "Shankesh Jewellers", detailUrl: "https://ipowatch.in/shankesh-jewellers-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("Shankesh Jewellers");

    const summary = await runDiscovery();

    expect(summary.draftsCreated).toBe(1);
    expect(createdIpos).toHaveLength(1);
    expect(createdIpos[0]).toMatchObject({ publicationState: "DRAFT", board: "MAINBOARD" });
  });

  it("never creates a row for a candidate that fails validation", async () => {
    listingResult = [{ companyName: "Broken Data Co", detailUrl: "https://ipowatch.in/broken-data-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => ({ ...validFacts("Broken Data Co"), priceBandLow: 200, priceBandHigh: 100 });

    const summary = await runDiscovery();

    expect(summary.draftsCreated).toBe(0);
    expect(summary.invalid).toHaveLength(1);
    expect(summary.invalid[0].companyName).toBe("Broken Data Co");
    expect(createdIpos).toHaveLength(0);
  });

  it("records a fetch failure without throwing or creating a row", async () => {
    listingResult = [{ companyName: "Unreachable Co", detailUrl: "https://ipowatch.in/unreachable-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => {
      throw new Error("ipowatch facts: HTTP 500");
    };

    const summary = await runDiscovery();

    expect(summary.draftsCreated).toBe(0);
    expect(summary.fetchFailed).toHaveLength(1);
    expect(createdIpos).toHaveLength(0);
  });

  it("marks a candidate cross-verified when Sahi also has a matching page", async () => {
    listingResult = [{ companyName: "Cross Verified Co", detailUrl: "https://ipowatch.in/cross-verified-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("Cross Verified Co");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    await runDiscovery();

    expect(createdIpos[0]).toMatchObject({ discoveredFrom: ["ipowatch", "sahi"] });
  });

  it("marks discoveredFrom as ipowatch-only when Sahi doesn't have it", async () => {
    listingResult = [{ companyName: "Solo Source Co", detailUrl: "https://ipowatch.in/solo-source-co-ipo/", board: "MAINBOARD" }];
    factsImpl = async () => validFacts("Solo Source Co");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await runDiscovery();

    expect(createdIpos[0]).toMatchObject({ discoveredFrom: ["ipowatch"] });
  });

  it("doesn't double-create when the same company appears twice in one listing pull", async () => {
    listingResult = [
      { companyName: "Duplicate Row Co", detailUrl: "https://ipowatch.in/duplicate-row-co-ipo/", board: "MAINBOARD" },
      { companyName: "Duplicate Row Co", detailUrl: "https://ipowatch.in/duplicate-row-co-ipo/", board: "MAINBOARD" },
    ];
    factsImpl = async () => validFacts("Duplicate Row Co");

    const summary = await runDiscovery();

    expect(summary.draftsCreated).toBe(1);
    expect(createdIpos).toHaveLength(1);
  });
});
