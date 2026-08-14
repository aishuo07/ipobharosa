import type { IpoFacts } from "../types";
import { issuerNamesMatch, normalizeComparableText, normalizeRegistrar } from "./normalization";
import { MATERIAL_OFFICIAL_FIELDS } from "./types";
import type {
  FieldComparison,
  MaterialOfficialField,
  OfficialEvidenceBundle,
  OfficialEvidenceResult,
  OfficialIpoEvidence,
  PublicationDecision,
} from "./types";

function dateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalizedManagers(values: string[]): string[] {
  return values.map(normalizeComparableText).sort();
}

function candidateValue(candidate: IpoFacts, field: MaterialOfficialField) {
  if (field === "rhpUrl") return candidate.rhpUrl;
  return candidate[field];
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function matches(field: MaterialOfficialField, candidate: unknown, official: unknown): boolean {
  if (field === "companyName") return issuerNamesMatch(String(candidate), String(official));
  if (field === "registrar") return normalizeRegistrar(String(candidate)) === normalizeRegistrar(String(official));
  if (field === "leadManagers") {
    return JSON.stringify(normalizedManagers(candidate as string[])) === JSON.stringify(normalizedManagers(official as string[]));
  }
  if (field === "openDate" || field === "closeDate") return dateKey(candidate as Date) === dateKey(official as Date);
  if (field === "rhpUrl") {
    return /^https:\/\/(?:www\.)?(?:nsearchives\.nseindia\.com|nseindia\.com|sebi\.gov\.in|listing\.bseindia\.com|bseindia\.com)\//i.test(String(official));
  }
  return candidate === official;
}

function displayValue(value: unknown): string | number | string[] | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateKey(value);
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

function comparisonsFor(candidate: IpoFacts, evidence: OfficialIpoEvidence): FieldComparison[] {
  return MATERIAL_OFFICIAL_FIELDS.map((field) => {
    const left = candidateValue(candidate, field);
    const right = evidence.facts[field];
    return {
      field,
      source: evidence.source,
      status: isMissing(right) ? "MISSING_OFFICIAL" : matches(field, left, right) ? "MATCH" : "CONFLICT",
      candidateValue: displayValue(left),
      officialValue: displayValue(right),
      sourceUrl: evidence.fieldSources[field] ?? evidence.sourceUrl,
    };
  });
}

function asBundle(input: OfficialEvidenceBundle | OfficialEvidenceResult): OfficialEvidenceBundle {
  if ("attempts" in input) return input;
  if (input.status === "FOUND") return {
    evidence: [input.evidence],
    attempts: [{
      source: input.evidence.source,
      status: "FOUND",
      reason: null,
      issueType: input.evidence.enrichment?.issueType ?? "IPO",
      sourceUrl: input.evidence.sourceUrl,
    }],
  };
  return {
    evidence: [],
    attempts: [{
      source: "NSE",
      status: input.status,
      reason: input.reason,
      issueType: input.status === "WRONG_ISSUE_TYPE" ? input.issueType : null,
      sourceUrl: input.status === "WRONG_ISSUE_TYPE" ? input.sourceUrl : null,
    }],
  };
}

export function decidePublication(candidate: IpoFacts, input: OfficialEvidenceBundle | OfficialEvidenceResult): PublicationDecision {
  const bundle = asBundle(input);
  const providersChecked = [...new Set(bundle.attempts.map((attempt) => attempt.source))];
  const providersFound = [...new Set(bundle.evidence.map((evidence) => evidence.source))];
  const base = {
    evidences: bundle.evidence,
    attempts: bundle.attempts,
    coverage: {
      matchedFields: 0,
      materialFields: MATERIAL_OFFICIAL_FIELDS.length,
      providersChecked,
      providersFound,
    },
  };

  const wrongTypes = bundle.attempts.filter((attempt) => attempt.status === "WRONG_ISSUE_TYPE");
  if (wrongTypes.length > 0 && bundle.evidence.length === 0) {
    return {
      ...base,
      decision: "EXCEPTION",
      reasons: wrongTypes.map((attempt) => attempt.reason ?? `${attempt.source} reports a non-IPO issue type`),
      comparisons: [],
      evidence: null,
      issueType: wrongTypes[0].issueType,
    };
  }

  if (bundle.evidence.length === 0) {
    return {
      ...base,
      decision: "RETRY",
      reasons: bundle.attempts.map((attempt) => attempt.reason ?? `${attempt.source} did not return official evidence`),
      comparisons: [],
      evidence: null,
      issueType: null,
    };
  }

  const allComparisons = bundle.evidence.flatMap((evidence) => comparisonsFor(candidate, evidence));
  const conflicts = allComparisons.filter((comparison) => comparison.status === "CONFLICT");
  if (conflicts.length > 0) {
    const evidence = bundle.evidence.find((item) => item.source === conflicts[0].source) ?? bundle.evidence[0];
    return {
      ...base,
      decision: "EXCEPTION",
      reasons: conflicts.map((comparison) => `${comparison.field} differs between discovery and ${comparison.source}`),
      comparisons: allComparisons,
      evidence,
      issueType: evidence.enrichment?.issueType ?? "IPO",
    };
  }

  const complete = bundle.evidence.filter((evidence) => {
    const comparisons = allComparisons.filter((comparison) => comparison.source === evidence.source);
    return comparisons.every((comparison) => comparison.status === "MATCH");
  });
  if (complete.length === 0) {
    const missing = allComparisons.filter((comparison) => comparison.status === "MISSING_OFFICIAL");
    return {
      ...base,
      decision: "RETRY",
      reasons: missing.map((comparison) => `${comparison.source} is missing material field ${comparison.field}`),
      comparisons: allComparisons,
      evidence: bundle.evidence[0],
      issueType: "IPO",
    };
  }

  const selected = complete.find((evidence) => evidence.source === "NSE") ?? complete[0];
  return {
    ...base,
    decision: "AUTO_PUBLISH",
    reasons: [],
    comparisons: allComparisons,
    evidence: selected,
    issueType: selected.enrichment?.issueType ?? "IPO",
    coverage: { ...base.coverage, matchedFields: MATERIAL_OFFICIAL_FIELDS.length },
  };
}
