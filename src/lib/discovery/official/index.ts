import { officialSourceRegistry } from "./registry";
import type { OfficialEvidenceAttempt, OfficialEvidenceBundle } from "./types";

export async function fetchOfficialIpoEvidence(companyName: string): Promise<OfficialEvidenceBundle> {
  const sources = officialSourceRegistry();
  const results = await Promise.all(sources.map(async (source) => ({ source: source.source, result: await source.findEvidence(companyName) })));
  const evidence = results.flatMap(({ result }) => result.status === "FOUND" ? [result.evidence] : []);
  const attempts: OfficialEvidenceAttempt[] = results.map(({ source, result }) => ({
    source,
    status: result.status,
    reason: result.status === "FOUND" ? null : result.reason,
    issueType: result.status === "WRONG_ISSUE_TYPE" ? result.issueType : result.status === "FOUND" ? result.evidence.enrichment?.issueType ?? "IPO" : null,
    sourceUrl: result.status === "FOUND" ? result.evidence.sourceUrl : result.status === "WRONG_ISSUE_TYPE" ? result.sourceUrl : null,
  }));
  return { evidence, attempts };
}

export * from "./types";
