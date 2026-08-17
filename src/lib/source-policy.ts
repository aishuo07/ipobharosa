import type { GmpAdapter } from "@/lib/gmp/types";

export type SourcePolicyStatus = "OFFICIAL_PRIMARY" | "TERMS_CONFLICT" | "PERMISSION_REQUIRED" | "ALLOWLIST_REQUIRED";

export type SourcePolicy = {
  key: string;
  name: string;
  purpose: "official" | "gmp" | "legacy-discovery" | "legacy-subscription";
  status: SourcePolicyStatus;
  productionEnabled: boolean;
  reason: string;
};

const SOURCE_POLICIES: SourcePolicy[] = [
  { key: "nse", name: "NSE", purpose: "official", status: "OFFICIAL_PRIMARY", productionEnabled: true, reason: "Primary official issue terms, documents and demand evidence" },
  { key: "sebi", name: "SEBI", purpose: "official", status: "OFFICIAL_PRIMARY", productionEnabled: true, reason: "Primary official DRHP/RHP filing catalogue" },
  { key: "ipowatch", name: "IPO Watch", purpose: "legacy-discovery", status: "TERMS_CONFLICT", productionEnabled: false, reason: "Disabled for new collection because the reviewed terms conflict with competing commercial use" },
  { key: "sahi", name: "Sahi", purpose: "legacy-subscription", status: "PERMISSION_REQUIRED", productionEnabled: false, reason: "Disabled for new collection until commercial/public reuse permission is confirmed" },
  { key: "ipoji", name: "IPO Ji", purpose: "gmp", status: "ALLOWLIST_REQUIRED", productionEnabled: false, reason: "Unofficial GMP provider; explicit launch allowlist and usage review required" },
  { key: "investorgain", name: "InvestorGain", purpose: "gmp", status: "ALLOWLIST_REQUIRED", productionEnabled: false, reason: "Unofficial GMP provider; explicit launch allowlist and usage review required" },
];

export function sourcePolicies(): SourcePolicy[] {
  return SOURCE_POLICIES.map((policy) => ({ ...policy }));
}

export function sourcePolicyFor(key: string): SourcePolicy | null {
  return sourcePolicies().find((policy) => policy.key === key) ?? null;
}

export function isGmpSourceEnabled(key: string, allowlist = process.env.GMP_SOURCE_ALLOWLIST ?? ""): boolean {
  const policy = sourcePolicyFor(key);
  if (policy?.purpose !== "gmp" || policy.status !== "ALLOWLIST_REQUIRED") return false;
  return new Set(allowlist.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)).has(key);
}

export function enabledGmpAdapters(adapters: GmpAdapter[], allowlist = process.env.GMP_SOURCE_ALLOWLIST ?? ""): GmpAdapter[] {
  return adapters.filter((adapter) => isGmpSourceEnabled(adapter.key, allowlist));
}
