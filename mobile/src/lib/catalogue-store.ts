import type { RegistrarCompany } from "@/src/lib/registrar-catalog";
import { getApiUrl } from "@/src/lib/api";

export type RegistrarKey = "kfin" | "bigshare" | "maashitla" | "mufg";

const CATALOGUE_TTL_MS = 60 * 60 * 1000;
const CACHE_PREFIX = "ipobharosa.catalogue.v1.";

type CatalogueCacheEntry = { data: RegistrarCompany[]; fetchedAt: number };

const isWeb = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

async function readEntry(key: string): Promise<CatalogueCacheEntry | null> {
  const raw = isWeb ? window.localStorage.getItem(CACHE_PREFIX + key) : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data) || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeEntry(key: string, entry: CatalogueCacheEntry): Promise<void> {
  if (!isWeb) return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * Fetch a registrar's full company catalogue from the server, falling back to
 * the bundled static snapshot if the network or server fails. The result is
 * cached locally (per registrar) so lookups keep working offline.
 */
export async function fetchRegistrarCatalogue(key: RegistrarKey): Promise<RegistrarCompany[]> {
  const cached = await readEntry(key);
  if (cached && Date.now() - cached.fetchedAt < CATALOGUE_TTL_MS) return cached.data;

  try {
    const response = await fetch(`${getApiUrl()}/api/catalogue/list?registrar=${key}`, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const body = (await response.json()) as { success?: boolean; companies?: RegistrarCompany[] };
      if (body.success && Array.isArray(body.companies) && body.companies.length > 0) {
        await writeEntry(key, { data: body.companies, fetchedAt: Date.now() });
        return body.companies;
      }
    }
  } catch {
    /* fall through to static snapshot */
  }

  const snapshots: Record<RegistrarKey, RegistrarCompany[]> = {
    kfin: (await import("@/src/lib/registrar-catalog")).KFIN_COMPANIES,
    bigshare: (await import("@/src/lib/registrar-catalog")).BIGSHARE_COMPANIES,
    maashitla: (await import("@/src/lib/registrar-catalog")).MAASHITLA_COMPANIES,
    mufg: [], // MUFG resolves its own company list at runtime via GetDetails.
  };
  return snapshots[key] ?? [];
}

export async function fetchAllCatalogues(): Promise<Partial<Record<RegistrarKey, RegistrarCompany[]>>> {
  const keys: RegistrarKey[] = ["kfin", "bigshare", "maashitla", "mufg"];
  const entries = await Promise.all(keys.map(async (key) => [key, await fetchRegistrarCatalogue(key)] as const));
  return Object.fromEntries(entries) as Partial<Record<RegistrarKey, RegistrarCompany[]>>;
}