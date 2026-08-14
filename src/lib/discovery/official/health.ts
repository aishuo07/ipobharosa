import { recordSourceFailure, recordSourceSuccess } from "@/lib/ingestion/source-operation";
import type { OfficialEvidenceAttempt, OfficialEvidenceBundle, OfficialEvidenceResult } from "./types";

export function evidenceAttempts(input: OfficialEvidenceBundle | OfficialEvidenceResult): OfficialEvidenceAttempt[] {
  if ("attempts" in input) return input.attempts;
  if (input.status === "FOUND") return [{
    source: input.evidence.source,
    status: "FOUND",
    reason: null,
    issueType: input.evidence.enrichment?.issueType ?? "IPO",
    sourceUrl: input.evidence.sourceUrl,
  }];
  return [{
    source: "NSE",
    status: input.status,
    reason: input.reason,
    issueType: input.status === "WRONG_ISSUE_TYPE" ? input.issueType : null,
    sourceUrl: input.status === "WRONG_ISSUE_TYPE" ? input.sourceUrl : null,
  }];
}

export function hasOfficialEvidence(input: OfficialEvidenceBundle | OfficialEvidenceResult): boolean {
  if ("attempts" in input) return input.evidence.length > 0;
  return input.status === "FOUND";
}

export async function recordOfficialEvidenceHealth(input: OfficialEvidenceBundle | OfficialEvidenceResult, now = new Date()): Promise<void> {
  await Promise.all(evidenceAttempts(input).map((attempt) => attempt.status === "UNAVAILABLE"
    ? recordSourceFailure(`${attempt.source.toLowerCase()}:ipo-evidence`, attempt.source, "ipo-evidence", attempt.reason ?? "official source unavailable", now)
    : recordSourceSuccess(`${attempt.source.toLowerCase()}:ipo-evidence`, attempt.source, "ipo-evidence", now)));
}
