export type DiscoveryConfidence = "HIGH" | "MEDIUM" | "QUARANTINE";

/**
 * Decides what happens to a scraped candidate without ever blindly
 * trusting a single source:
 *
 * - QUARANTINE: the data itself is internally inconsistent (bad dates,
 *   inverted price band, missing required fields) — kept, not
 *   discarded, so a human can see exactly why rather than the pipeline
 *   silently re-finding and re-failing it every cycle forever.
 * - HIGH: internally consistent AND a second independent source agrees
 *   the IPO exists AND an official DRHP/RHP link is present — safe to
 *   publish without a human in the loop.
 * - MEDIUM: internally consistent but missing one of those two extra
 *   confirmations — held as a draft for human review rather than
 *   auto-published on ipowatch's word alone.
 */
export function classifyCandidate(params: {
  validationProblems: string[];
  crossVerified: boolean;
  hasOfficialDocument: boolean;
}): DiscoveryConfidence {
  if (params.validationProblems.length > 0) return "QUARANTINE";
  if (params.crossVerified && params.hasOfficialDocument) return "HIGH";
  return "MEDIUM";
}
