import { prisma } from "@/lib/prisma";
import { toIpoSlug } from "@/lib/ipo-slug";
import { fetchIpoListing } from "./ipowatch-list";
import { fetchIpoFacts } from "./ipowatch-facts";
import { validateIpoFacts } from "./validate";
import type { IpoFacts, IpoListingCandidate } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (compatible; IPOBharosaBot/1.0; +https://ipobharosa.vercel.app)";
const FETCH_TIMEOUT_MS = 15000;
// Processing candidates a few at a time, rather than either fully
// sequential (slow — this can be dozens of network round-trips on the
// first run against months of backlog) or fully parallel (impolite to
// the source and more likely to trip rate limiting), keeps runs fast
// without hammering ipowatch.in/sahi.com.
const CONCURRENCY = 5;

function deriveInitialStatus(facts: IpoFacts, now: Date): "UPCOMING" | "OPEN" | "CLOSED" {
  if (now < facts.openDate) return "UPCOMING";
  if (now <= facts.closeDate) return "OPEN";
  return "CLOSED";
}

/**
 * A second, independent source agreeing the company is actually doing an
 * IPO right now raises confidence in the candidate — same trust
 * philosophy as the GMP median, applied to discovery instead of pricing.
 * A HEAD request against Sahi's known per-IPO slug convention is enough;
 * we don't need Sahi's own facts since ipowatch's are already structured.
 */
async function existsOnSahi(companyName: string): Promise<boolean> {
  const slug = toIpoSlug(companyName);
  try {
    const res = await fetch(`https://www.sahi.com/blogs/${slug}-ipo-gmp-today`, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export type DiscoverySummary = {
  candidatesSeen: number;
  alreadyTracked: number;
  draftsCreated: number;
  invalid: { companyName: string; problems: string[] }[];
  fetchFailed: { companyName: string; error: string }[];
};

type CandidateOutcome =
  | { kind: "created" }
  | { kind: "invalid"; companyName: string; problems: string[] }
  | { kind: "fetchFailed"; companyName: string; error: string };

async function processCandidate(candidate: IpoListingCandidate): Promise<CandidateOutcome> {
  let facts: IpoFacts;
  try {
    facts = await fetchIpoFacts(candidate.detailUrl, candidate.companyName, candidate.board);
  } catch (e) {
    return { kind: "fetchFailed", companyName: candidate.companyName, error: (e as Error).message };
  }

  const problems = validateIpoFacts(facts);
  if (problems.length > 0) {
    return { kind: "invalid", companyName: candidate.companyName, problems };
  }

  const crossVerified = await existsOnSahi(candidate.companyName);
  const now = new Date();

  const company = await prisma.company.create({ data: { name: facts.companyName } });
  await prisma.ipo.create({
    data: {
      companyId: company.id,
      status: deriveInitialStatus(facts, now),
      board: facts.board,
      priceBandLow: facts.priceBandLow,
      priceBandHigh: facts.priceBandHigh,
      lotSize: facts.lotSize,
      issueSizeCr: facts.issueSizeCr,
      freshIssueCr: facts.freshIssueCr,
      ofsCr: facts.ofsCr,
      openDate: facts.openDate,
      closeDate: facts.closeDate,
      allotmentDate: facts.allotmentDate,
      refundDate: facts.refundDate,
      listingDate: facts.listingDate,
      registrar: facts.registrar,
      leadManagers: facts.leadManagers,
      publicationState: "DRAFT",
      discoveredFrom: crossVerified ? ["ipowatch", "sahi"] : ["ipowatch"],
      discoveredAt: now,
    },
  });
  return { kind: "created" };
}

/**
 * Finds IPOs on ipowatch.in's listing that we aren't tracking yet, pulls
 * full facts from each one's detail page, validates them, and saves
 * anything that passes as a DRAFT — never published automatically. See
 * scripts/list-draft-ipos.ts and scripts/review-draft-ipo.ts for the
 * human approval step.
 */
export async function runDiscovery(): Promise<DiscoverySummary> {
  const summary: DiscoverySummary = {
    candidatesSeen: 0,
    alreadyTracked: 0,
    draftsCreated: 0,
    invalid: [],
    fetchFailed: [],
  };

  const listing = await fetchIpoListing();
  summary.candidatesSeen = listing.length;

  const knownCompanies = await prisma.company.findMany({ select: { name: true } });
  const knownSlugs = knownCompanies.map((c) => toIpoSlug(c.name));

  // The listing page sometimes uses a shortened display name ("Milky
  // Mist") where our own record has the full legal name ("Milky Mist
  // Dairy Food Ltd") — an exact slug match would miss that and create a
  // duplicate. A slug containment check in either direction catches the
  // shortened-name case without needing fuzzy matching.
  // Require the shorter slug to have some real substance before treating
  // containment as a match — otherwise a short, generic slug could
  // coincidentally match an unrelated company.
  const MIN_CONTAINMENT_LENGTH = 6;
  function isAlreadyKnown(slug: string): boolean {
    return knownSlugs.some((known) => {
      if (known === slug) return true;
      const shorter = known.length <= slug.length ? known : slug;
      if (shorter.length < MIN_CONTAINMENT_LENGTH) return false;
      return known.includes(slug) || slug.includes(known);
    });
  }

  const newCandidates: IpoListingCandidate[] = [];
  for (const candidate of listing) {
    const slug = toIpoSlug(candidate.companyName);
    if (isAlreadyKnown(slug)) {
      summary.alreadyTracked++;
      continue;
    }
    // Guards against the same company appearing twice within one run
    // (e.g. a data-entry duplicate on the source page itself).
    knownSlugs.push(slug);
    newCandidates.push(candidate);
  }

  const outcomes = await mapWithConcurrency(newCandidates, CONCURRENCY, processCandidate);
  for (const outcome of outcomes) {
    if (outcome.kind === "created") summary.draftsCreated++;
    else if (outcome.kind === "invalid") summary.invalid.push(outcome);
    else summary.fetchFailed.push(outcome);
  }

  return summary;
}
