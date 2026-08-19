import type { RegistrarCompany, RegistrarKey, CacheEntry, FetchOptions } from "./types";
import { fetchCatalogue } from "./fetchers";

const CACHE_TTL = 60 * 60 * 1000;

const cache = new Map<RegistrarKey, CacheEntry>();

export async function getCatalogue(key: RegistrarKey, opts: FetchOptions = {}): Promise<RegistrarCompany[]> {
  const entry = cache.get(key);
  const now = Date.now();

  if (entry && !opts.force && now - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }

  if (entry && now - entry.timestamp >= CACHE_TTL) {
    refreshInBackground(key);
    return entry.data;
  }

  return refreshSync(key);
}

function refreshInBackground(key: RegistrarKey): void {
  setTimeout(async () => {
    try {
      const data = await fetchCatalogue(key);
      cache.set(key, { data, timestamp: Date.now() });
    } catch {
      // Ignore background refresh errors
    }
  }, 0);
}

async function refreshSync(key: RegistrarKey): Promise<RegistrarCompany[]> {
  const data = await fetchCatalogue(key);
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}

export async function refreshCatalogue(key?: RegistrarKey): Promise<void> {
  const keys: RegistrarKey[] = key ? [key] : ["kfin", "bigshare", "maashitla", "mufg"];
  await Promise.all(keys.map((k) => refreshSync(k)));
}

export function getCacheStats(): { key: string; size: number; ageMs: number }[] {
  const now = Date.now();
  return Array.from(cache.entries()).map(([key, entry]) => ({
    key,
    size: entry.data.length,
    ageMs: now - entry.timestamp,
  }));
}

