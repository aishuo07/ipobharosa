import type { AllotmentResult } from "@/src/lib/allotment";

export type AllotmentCache = Record<string, AllotmentResult>;

export type IpoAllotmentCache = Record<string, AllotmentCache>;

const STORAGE_KEY = "ipobharosa.allotment-cache.v1";

const isWeb = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

async function readStore(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  const { getItemAsync } = await import("expo-secure-store");
  return getItemAsync(key);
}

async function writeStore(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage may be unavailable */
    }
    return;
  }
  const { setItemAsync } = await import("expo-secure-store");
  await setItemAsync(key, value);
}

export async function loadAllotmentCache(): Promise<IpoAllotmentCache> {
  const raw = await readStore(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveAllotmentCache(cache: IpoAllotmentCache): Promise<void> {
  await writeStore(STORAGE_KEY, JSON.stringify(cache));
}

export async function cacheAllotmentResult(ipoId: string, result: AllotmentResult): Promise<IpoAllotmentCache> {
  const cache = await loadAllotmentCache();
  cache[ipoId] = { ...(cache[ipoId] ?? {}), [result.pan]: result };
  await saveAllotmentCache(cache);
  return cache;
}
