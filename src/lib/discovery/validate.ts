import type { IpoFacts } from "./types";

/**
 * Returns a list of human-readable problems with a scraped candidate.
 * An empty array means the facts are internally consistent enough to
 * save as a draft — this does NOT mean the data is correct, only that
 * it isn't obviously broken. A human still has to approve it before it
 * goes live.
 */
export function validateIpoFacts(facts: IpoFacts): string[] {
  const problems: string[] = [];

  if (!facts.companyName.trim()) problems.push("missing company name");

  if (!(facts.priceBandLow > 0) || !(facts.priceBandHigh > 0)) {
    problems.push("price band values must be positive");
  } else if (facts.priceBandLow > facts.priceBandHigh) {
    problems.push(`price band low (${facts.priceBandLow}) is above price band high (${facts.priceBandHigh})`);
  }

  if (!Number.isInteger(facts.lotSize) || facts.lotSize <= 0) {
    problems.push(`lot size must be a positive integer, got ${facts.lotSize}`);
  }

  if (!(facts.issueSizeCr > 0)) {
    problems.push(`issue size must be positive, got ${facts.issueSizeCr}`);
  }

  if (!facts.registrar.trim()) problems.push("missing registrar");
  if (facts.leadManagers.length === 0) problems.push("missing lead managers");

  const { openDate, closeDate, allotmentDate, refundDate, listingDate } = facts;
  if (!(openDate.getTime() < closeDate.getTime())) {
    problems.push("open date must be strictly before close date");
  }
  if (!(closeDate.getTime() <= allotmentDate.getTime())) {
    problems.push("close date must be on or before allotment date");
  }
  if (!(allotmentDate.getTime() <= refundDate.getTime())) {
    problems.push("allotment date must be on or before refund date");
  }
  if (!(refundDate.getTime() <= listingDate.getTime())) {
    problems.push("refund date must be on or before listing date");
  }

  return problems;
}
