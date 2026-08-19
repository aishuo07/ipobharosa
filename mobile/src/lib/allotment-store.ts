import type { AllotmentResult } from "@/src/lib/allotment";

export type AllotmentCache = Record<string, AllotmentResult>;

export type IpoAllotmentCache = Record<string, AllotmentCache>;

// One storage key per IPO keeps each SecureStore value well under iOS's
// 2048-byte limit, which silently dropped the whole cache before.
const KEY_PREFIX = "ipobharosa.allotment.";
const INDEX_KEY = "ipobharosa.allotment-index.v1";

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

async function readIndex(): Promise<string[]> {
  const raw = await readStore(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

async function writeIndex(ipoIds: string[]): Promise<void> {
  await writeStore(INDEX_KEY, JSON.stringify(ipoIds));
}

export async function loadAllotmentCache(): Promise<IpoAllotmentCache> {
  const ipoIds = await readIndex();
  const cache: IpoAllotmentCache = {};
  for (const ipoId of ipoIds) {
    const raw = await readStore(KEY_PREFIX + ipoId);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") cache[ipoId] = parsed;
    } catch {
      /* skip corrupt entry */
    }
  }
  return cache;
}

export async function cacheAllotmentResult(ipoId: string, result: AllotmentResult): Promise<IpoAllotmentCache> {
  const ipoIds = await readIndex();
  if (!ipoIds.includes(ipoId)) {
    await writeIndex([...ipoIds, ipoId]);
  }
  const existing = await readStore(KEY_PREFIX + ipoId);
  let perIpo: AllotmentCache = {};
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === "object") perIpo = parsed;
    } catch {
      /* ignore */
    }
  }
  perIpo = { ...perIpo, [result.pan]: result };
  await writeStore(KEY_PREFIX + ipoId, JSON.stringify(perIpo));
  return { [ipoId]: perIpo };
}