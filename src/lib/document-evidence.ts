export type FilingEvidenceClass = "OFFICIAL" | "ISSUER_OR_MANAGER" | "THIRD_PARTY";

const OFFICIAL_HOSTS = ["sebi.gov.in", "nseindia.com", "bseindia.com"];
const AGGREGATOR_HOSTS = ["ipowatch.in"];

export function filingEvidenceClass(sourceUrl: string): FilingEvidenceClass {
  let host: string;
  try { host = new URL(sourceUrl).hostname.toLowerCase(); }
  catch { return "THIRD_PARTY"; }
  if (OFFICIAL_HOSTS.some((official) => host === official || host.endsWith(`.${official}`))) return "OFFICIAL";
  if (AGGREGATOR_HOSTS.some((aggregator) => host === aggregator || host.endsWith(`.${aggregator}`))) return "THIRD_PARTY";
  return "ISSUER_OR_MANAGER";
}

export function filingEvidenceLabel(sourceUrl: string): string {
  const evidenceClass = filingEvidenceClass(sourceUrl);
  if (evidenceClass === "OFFICIAL") return "Official exchange / SEBI source";
  if (evidenceClass === "ISSUER_OR_MANAGER") return "Issuer or lead-manager hosted filing copy";
  return "Third-party hosted filing copy";
}

export function filingSourceHost(sourceUrl: string): string {
  try { return new URL(sourceUrl).hostname.replace(/^www\./, ""); }
  catch { return "unknown source"; }
}
