import { toIpoSlug } from "@/lib/ipo-slug";
import { normalizedNamesMatch } from "@/lib/gmp/name-match";
import { ipobharosaUserAgent } from "@/lib/site-url";
import type { GmpAdapter } from "../types";
import type { ProviderResult } from "@/lib/ingestion/provider-result";

const REPORT_URL = "https://www.investorgain.com/report/ipo-gmp-live/331/";
const API_ROOT = "https://webnodejs.investorgain.com/cloud/v2/report/data-read/331/1";
const CACHE_TTL_MS = 5 * 60 * 1000;

type InvestorGainRow = {
  "~ipo_name"?: unknown;
  GMP?: unknown;
};

const NAME_ALIASES: Record<string, string> = {
  "credent-connect-n-care": "credent-connect",
  "technocrats-plasma": "technocrats-plasma-systems",
};

let cachedRows: { expiresAt: number; promise: Promise<InvestorGainRow[]> } | null = null;

function financialYear(date: Date): string {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function investorGainApiUrl(date = new Date()): string {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return `${API_ROOT}/${month}/${year}/${financialYear(date)}/0/all?search=`;
}

export function parseInvestorGainRows(payload: unknown): InvestorGainRow[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("investorgain: response was not an object");
  }
  const rows = (payload as { reportTableData?: unknown }).reportTableData;
  if (!Array.isArray(rows)) {
    throw new Error("investorgain: response did not contain reportTableData");
  }
  return rows as InvestorGainRow[];
}

function normalizedSourceName(companyName: string): string {
  const normalized = toIpoSlug(companyName);
  return NAME_ALIASES[normalized] ?? normalized;
}

export function findInvestorGainGmp(companyName: string, rows: InvestorGainRow[]): ProviderResult<number> {
  const expected = normalizedSourceName(companyName);
  const row = rows.find((candidate) =>
    typeof candidate["~ipo_name"] === "string" && normalizedNamesMatch(expected, normalizedSourceName(candidate["~ipo_name"])),
  );
  if (!row) {
    return { kind: "NOT_COVERED", reason: `InvestorGain has no matching IPO row for ${companyName}` };
  }

  const raw = typeof row.GMP === "string" ? row.GMP : "";
  if (!raw || /(?:^|>)\s*--\s*(?:<|$)/.test(raw)) {
    return { kind: "NOT_YET_AVAILABLE", reason: `InvestorGain has not published an active GMP quote for ${companyName}` };
  }
  const boldValue = raw.match(/<b>\s*(-?\d+(?:\.\d+)?)\s*<\/b>/i);
  if (!boldValue) {
    throw new Error(`investorgain: could not parse GMP for "${companyName}"`);
  }
  const value = Number(boldValue[1]);
  if (!Number.isFinite(value)) {
    throw new Error(`investorgain: GMP was not numeric for "${companyName}"`);
  }
  return { kind: "VALUE", value };
}

async function fetchRows(): Promise<InvestorGainRow[]> {
  const now = Date.now();
  if (cachedRows && cachedRows.expiresAt > now) return cachedRows.promise;

  const promise = fetch(investorGainApiUrl(), {
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: "application/json",
      "User-Agent": ipobharosaUserAgent(),
      Referer: REPORT_URL,
    },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`investorgain: HTTP ${response.status}`);
    return parseInvestorGainRows(await response.json());
  });
  cachedRows = { expiresAt: now + CACHE_TTL_MS, promise };
  try {
    return await promise;
  } catch (error) {
    cachedRows = null;
    throw error;
  }
}

export const investorGainAdapter: GmpAdapter = {
  key: "investorgain",
  name: "InvestorGain",
  async fetchGmp(companyName: string): Promise<ProviderResult<number>> {
    return findInvestorGainGmp(companyName, await fetchRows());
  },
};
