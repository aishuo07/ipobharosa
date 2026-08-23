import { prisma } from "@/lib/prisma";
import { toIpoSlug } from "@/lib/ipo-slug";
import { fetchIpoListing } from "./ipowatch-list";
import { fetchIpoFacts } from "./ipowatch-facts";
import { validateIpoFacts } from "./validate";
import type { IpoFacts, IpoListingCandidate } from "./types";
import { fetchOfficialIpoEvidence } from "./official";
import { decidePublication } from "./official/consensus";
import { recordOfficialEvidenceHealth } from "./official/health";
import { officialAutoPublishEnabled, persistOfficialDecision, persistOfficialIncident } from "./official/persistence";

// Processing candidates a few at a time, rather than either fully
// sequential (slow — this can be dozens of network round-trips on the
// first run against months of backlog) or fully parallel (impolite to
// the source and more likely to trip rate limiting), keeps runs fast
// without hammering ipowatch.in/sahi.com.
const CONCURRENCY = 2;
// Listing discovery should be complete, but detail-page validation is
// intentionally bounded. The source is newest-first, so every hourly
// cycle takes the next untracked candidates without risking a serverless
// timeout or hammering upstream sites. `deferredCandidates` makes the
// remaining backlog visible instead of silently dropping it.
const MAX_CANDIDATES_PER_RUN = 15;
// A human review queue that grows forever isn't "human review", it's a
// backlog nobody will ever clear. Once DRAFT+QUARANTINED hits this, new
// candidates are skipped (and it's surfaced as `queueCapped`) rather
// than silently piling on more.
const MAX_UNREVIEWED_QUEUE = 100;
const RETRY_BASE_HOURS = 2;
const RETRY_MAX_HOURS = 24;

function deriveInitialStatus(facts: IpoFacts, now: Date): "UPCOMING" | "OPEN" | "CLOSED" {
  if (now < facts.openDate) return "UPCOMING";
  if (now <= facts.closeDate) return "OPEN";
  return "CLOSED";
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
  autoPublished: number;
  draftsCreated: number;
  quarantined: number;
  rejectedWrongType: number;
  fetchFailed: { companyName: string; error: string }[];
  dbErrors: { companyName: string; error: string }[];
  queueCapped: boolean;
  deferredCandidates: number;
};

type CandidateOutcome =
  | { kind: "autoPublished" }
  | { kind: "draftCreated" }
  | { kind: "quarantined" }
  | { kind: "rejectedWrongType" }
  | { kind: "fetchFailed"; companyName: string; error: string }
  | { kind: "dbError"; companyName: string; error: string };

async function processCandidate(candidate: IpoListingCandidate): Promise<CandidateOutcome> {
  let facts: IpoFacts;
  try {
    facts = await fetchIpoFacts(candidate.detailUrl, candidate.companyName, candidate.board);
  } catch (e) {
    return { kind: "fetchFailed", companyName: candidate.companyName, error: (e as Error).message };
  }

  const problems = validateIpoFacts(facts);
  if (problems.length > 0) {
    // Invalid secondary facts are an actual data exception. They are kept
    // visible to operators, not retried forever or published.
    const now = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        const company = await tx.company.create({ data: { name: facts.companyName } });
        await tx.ipo.create({
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
            drhpUrl: facts.drhpUrl,
            rhpUrl: facts.rhpUrl,
            sourceUrl: candidate.detailUrl,
            publicationState: "QUARANTINED",
            quarantineReason: problems.join("; "),
            discoveredFrom: ["ipowatch"],
            discoveredAt: now,
          },
        });
      }, { timeout: 30000 });
      return { kind: "quarantined" };
    } catch (e) {
      return { kind: "dbError", companyName: candidate.companyName, error: (e as Error).message };
    }
  }

  const officialResult = await fetchOfficialIpoEvidence(facts.companyName);
  await recordOfficialEvidenceHealth(officialResult);
  const decision = decidePublication(facts, officialResult);
  if (decision.decision === "RETRY") {
    return { kind: "fetchFailed", companyName: candidate.companyName, error: decision.reasons.join("; ") };
  }

  const now = new Date();
  const wrongIssueType = decision.issueType !== null && decision.issueType !== undefined && decision.issueType !== "IPO";
  const shouldPublish = !wrongIssueType && decision.decision === "AUTO_PUBLISH" && officialAutoPublishEnabled();
  const publicationState = wrongIssueType ? "REJECTED" : decision.decision === "EXCEPTION" ? "QUARANTINED" : shouldPublish ? "PUBLISHED" : "DRAFT";
  const officialFacts = decision.evidence?.facts ?? facts;
  const officialSources = [...new Set((decision.attempts ?? []).map((attempt) => attempt.source.toLowerCase()))];

  try {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: facts.companyName } });
      const ipo = await tx.ipo.create({
        data: {
          companyId: company.id,
          status: deriveInitialStatus(facts, now),
          board: officialFacts.board!,
          priceBandLow: officialFacts.priceBandLow!,
          priceBandHigh: officialFacts.priceBandHigh!,
          lotSize: officialFacts.lotSize!,
          issueSizeCr: facts.issueSizeCr,
          freshIssueCr: facts.freshIssueCr,
          ofsCr: facts.ofsCr,
          openDate: officialFacts.openDate!,
          closeDate: officialFacts.closeDate!,
          allotmentDate: facts.allotmentDate,
          refundDate: facts.refundDate,
          listingDate: facts.listingDate,
          registrar: officialFacts.registrar!,
          leadManagers: officialFacts.leadManagers,
          drhpUrl: facts.drhpUrl,
          rhpUrl: officialFacts.rhpUrl!,
          sourceUrl: candidate.detailUrl,
          publicationState,
          autoPublished: shouldPublish,
          quarantineReason: decision.decision === "EXCEPTION" ? decision.reasons.join("; ") : null,
          officialIssueType: decision.issueType ?? null,
          discoveredFrom: ["ipowatch", ...officialSources],
          discoveredAt: now,
          reviewedAt: shouldPublish ? now : null,
          officialLastAttemptAt: now,
          officialLastSuccessAt: decision.evidence ? now : null,
        },
      });
      const filingDocuments = [
        facts.drhpUrl ? { ipoId: ipo.id, label: "Draft Red Herring Prospectus (DRHP)", url: facts.drhpUrl, docType: "drhp" } : null,
        officialFacts.rhpUrl ? {
          ipoId: ipo.id,
          label: /(?:^|[/_])prospectus(?:[_.]|$)/i.test(officialFacts.rhpUrl)
            ? "Official Prospectus"
            : "Red Herring Prospectus (RHP)",
          url: officialFacts.rhpUrl,
          docType: "rhp",
        } : null,
      ].filter((document): document is NonNullable<typeof document> => document !== null);
      if (filingDocuments.length > 0) await tx.document.createMany({ data: filingDocuments });
      await persistOfficialDecision(tx, ipo.id, decision);
      if (decision.decision === "EXCEPTION" && decision.evidence) {
        await persistOfficialIncident(tx, ipo.id, "CONFLICT", decision);
      }
      if (shouldPublish) {
        await tx.correctionLog.create({
          data: {
            entityType: "Ipo",
            entityId: ipo.id,
            action: "auto-publish",
            performedBy: "discovery-pipeline",
            note: `all material IPO fields matched captured official evidence from ${(decision.coverage?.providersFound ?? [decision.evidence?.source ?? "official exchange"]).join(" + ")}`,
          },
        });
      }
    }, { timeout: 30000 });
  } catch (e) {
    return { kind: "dbError", companyName: candidate.companyName, error: (e as Error).message };
  }

  return wrongIssueType
    ? { kind: "rejectedWrongType" }
    : shouldPublish ? { kind: "autoPublished" } : publicationState === "DRAFT" ? { kind: "draftCreated" } : { kind: "quarantined" };
}

/**
 * Finds IPOs on ipowatch.in's listing that we aren't tracking yet, pulls
 * full facts from each one's detail page, and routes each candidate by
 * evidence: internally-inconsistent or conflicting data is quarantined;
 * temporary official-source gaps retry; complete field-level agreement
 * can auto-publish when the production safety flag is enabled. See
 * scripts/list-draft-ipos.ts and scripts/review-draft-ipo.ts for the
 * human review step.
 */
export async function runDiscovery(): Promise<DiscoverySummary> {
  const summary: DiscoverySummary = {
    candidatesSeen: 0,
    alreadyTracked: 0,
    autoPublished: 0,
    draftsCreated: 0,
    quarantined: 0,
    rejectedWrongType: 0,
    fetchFailed: [],
    dbErrors: [],
    queueCapped: false,
    deferredCandidates: 0,
  };

  const unreviewedCount = await prisma.ipo.count({
    where: { publicationState: { in: ["DRAFT", "QUARANTINED"] } },
  });
  if (unreviewedCount >= MAX_UNREVIEWED_QUEUE) {
    summary.queueCapped = true;
    return summary;
  }

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

  console.log(`[discovery] listing=${listing.length} knownSlugs=${knownSlugs.length} newCandidates=${newCandidates.length}`);

  const now = new Date();
  const previousAttempts = await prisma.discoveryAttempt.findMany({
    where: { sourceUrl: { in: newCandidates.map((candidate) => candidate.detailUrl) } },
  });
  const attemptByUrl = new Map(previousAttempts.map((attempt) => [attempt.sourceUrl, attempt]));
  // Fresh candidates come first. A failed source page becomes eligible only
  // after its exponential backoff; it can no longer occupy every batch.
  const eligibleCandidates = newCandidates
    .filter((candidate) => {
      const attempt = attemptByUrl.get(candidate.detailUrl);
      return !attempt || attempt.nextAttemptAt <= now;
    })
    .sort((a, b) => Number(attemptByUrl.has(a.detailUrl)) - Number(attemptByUrl.has(b.detailUrl)));

  // Respect the same cap mid-run: stop admitting new unreviewed rows once
  // the queue fills up, even if this run alone would otherwise blow past it.
  const room = Math.max(0, MAX_UNREVIEWED_QUEUE - unreviewedCount);
  const admitted = eligibleCandidates.slice(0, room);
  if (eligibleCandidates.length > admitted.length) summary.queueCapped = true;
  const toProcess = admitted.slice(0, MAX_CANDIDATES_PER_RUN);
  summary.deferredCandidates = newCandidates.length - toProcess.length;

  console.log(`[discovery] unreviewedCount=${unreviewedCount} room=${room} eligibleCandidates=${eligibleCandidates.length} admitted=${admitted.length} toProcess=${toProcess.length} deferred=${summary.deferredCandidates}`);

  const outcomes = await mapWithConcurrency(toProcess, CONCURRENCY, processCandidate);
  console.log(`[discovery] outcomes:`, outcomes.map(o => o.kind));
  for (let index = 0; index < outcomes.length; index++) {
    const outcome = outcomes[index];
    const candidate = toProcess[index];
    if (outcome.kind === "autoPublished") summary.autoPublished++;
    else if (outcome.kind === "draftCreated") summary.draftsCreated++;
    else if (outcome.kind === "quarantined") summary.quarantined++;
    else if (outcome.kind === "rejectedWrongType") summary.rejectedWrongType++;
    else if (outcome.kind === "fetchFailed") summary.fetchFailed.push(outcome);
    else summary.dbErrors.push(outcome);

    if (outcome.kind === "fetchFailed") {
      const priorAttempts = attemptByUrl.get(candidate.detailUrl)?.attempts ?? 0;
      const attempts = priorAttempts + 1;
      const delayHours = Math.min(RETRY_MAX_HOURS, RETRY_BASE_HOURS * 2 ** (attempts - 1));
      await prisma.discoveryAttempt.upsert({
        where: { sourceUrl: candidate.detailUrl },
        create: {
          sourceUrl: candidate.detailUrl,
          companyName: candidate.companyName,
          attempts,
          lastAttemptAt: now,
          nextAttemptAt: new Date(now.getTime() + delayHours * 60 * 60 * 1000),
          lastError: outcome.error,
        },
        update: {
          companyName: candidate.companyName,
          attempts,
          lastAttemptAt: now,
          nextAttemptAt: new Date(now.getTime() + delayHours * 60 * 60 * 1000),
          lastError: outcome.error,
        },
      });
    } else if (outcome.kind !== "dbError") {
      await prisma.discoveryAttempt.deleteMany({ where: { sourceUrl: candidate.detailUrl } });
    }
  }

  return summary;
}
