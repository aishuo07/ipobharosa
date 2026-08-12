import type { IpoFacts } from "../types";
import { normalizeComparableText } from "./normalization";
import { MATERIAL_OFFICIAL_FIELDS } from "./types";
import type { FieldComparison, MaterialOfficialField, OfficialEvidenceResult, PublicationDecision } from "./types";

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
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
  if (field === "companyName" || field === "registrar") {
    return normalizeComparableText(String(candidate)) === normalizeComparableText(String(official));
  }
  if (field === "leadManagers") {
    return JSON.stringify(normalizedManagers(candidate as string[])) === JSON.stringify(normalizedManagers(official as string[]));
  }
  if (field === "openDate" || field === "closeDate") return dateKey(candidate as Date) === dateKey(official as Date);
  if (field === "rhpUrl") return /^https:\/\/(?:www\.)?(?:nsearchives\.nseindia\.com|nseindia\.com|sebi\.gov\.in)\//i.test(String(official));
  return candidate === official;
}

function displayValue(value: unknown): string | number | string[] | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateKey(value);
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

export function decidePublication(candidate: IpoFacts, officialResult: OfficialEvidenceResult): PublicationDecision {
  if (officialResult.status !== "FOUND") {
    return { decision: "RETRY", reasons: [officialResult.reason], comparisons: [], evidence: null };
  }

  const { evidence } = officialResult;
  const comparisons: FieldComparison[] = MATERIAL_OFFICIAL_FIELDS.map((field) => {
    const left = candidateValue(candidate, field);
    const right = evidence.facts[field];
    return {
      field,
      status: isMissing(right) ? "MISSING_OFFICIAL" : matches(field, left, right) ? "MATCH" : "CONFLICT",
      candidateValue: displayValue(left),
      officialValue: displayValue(right),
      sourceUrl: evidence.fieldSources[field] ?? evidence.sourceUrl,
    };
  });
  const missing = comparisons.filter((comparison) => comparison.status === "MISSING_OFFICIAL");
  if (missing.length > 0) {
    return {
      decision: "RETRY",
      reasons: missing.map((comparison) => `${evidence.source} is missing material field ${comparison.field}`),
      comparisons,
      evidence,
    };
  }
  const conflicts = comparisons.filter((comparison) => comparison.status === "CONFLICT");
  if (conflicts.length > 0) {
    return {
      decision: "EXCEPTION",
      reasons: conflicts.map((comparison) => `${comparison.field} differs between discovery and ${evidence.source}`),
      comparisons,
      evidence,
    };
  }
  return { decision: "AUTO_PUBLISH", reasons: [], comparisons, evidence };
}

