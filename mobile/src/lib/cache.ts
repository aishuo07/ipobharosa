import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BoardFilter, BoardIpo } from "@/src/lib/types";

const CACHE_PREFIX = "ipobharosa.cache";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

export async function getCachedBoard(filter: BoardFilter): Promise<BoardIpo[] | null> {
  try {
    const key = `${CACHE_PREFIX}.board.${filter}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<BoardIpo[]> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCachedBoard(filter: BoardFilter, data: BoardIpo[]): Promise<void> {
  try {
    const key = `${CACHE_PREFIX}.board.${filter}`;
    const entry: CacheEntry<BoardIpo[]> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

export async function getCachedIpo(slug: string): Promise<BoardIpo | null> {
  try {
    const key = `${CACHE_PREFIX}.ipo.${slug}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<BoardIpo> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCachedIpo(slug: string, data: BoardIpo): Promise<void> {
  try {
    const key = `${CACHE_PREFIX}.ipo.${slug}`;
    const entry: CacheEntry<BoardIpo> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
  } catch {
    // Non-critical
  }
}
