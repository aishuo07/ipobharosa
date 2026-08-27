import * as SecureStore from "expo-secure-store";

export type PanCard = {
  id: string;
  pan: string;
  holderName: string;
  createdAt: string;
};

const STORAGE_KEY = "ipobharosa.pan-cards.v1";

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function normalizePan(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidPan(value: string): boolean {
  return PAN_PATTERN.test(normalizePan(value));
}

export function generatePanId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const isWeb = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

async function readStore(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
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
  await SecureStore.setItemAsync(key, value);
}

export async function loadPanCards(): Promise<PanCard[]> {
  const raw = await readStore(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePanCards(cards: PanCard[]): Promise<void> {
  await writeStore(STORAGE_KEY, JSON.stringify(cards));
}

export async function addPanCard(pan: string, holderName: string): Promise<PanCard> {
  const normalized = normalizePan(pan);
  const card: PanCard = {
    id: generatePanId(),
    pan: normalized,
    holderName: holderName.trim(),
    createdAt: new Date().toISOString(),
  };
  const cards = await loadPanCards();
  const duplicate = cards.some((existing) => existing.pan === normalized);
  if (duplicate) throw new Error("This PAN is already saved");
  await savePanCards([...cards, card]);
  return card;
}

export async function removePanCard(id: string): Promise<void> {
  const cards = await loadPanCards();
  await savePanCards(cards.filter((card) => card.id !== id));
}