import * as SecureStore from "expo-secure-store";

// An investor profile holds the details a UPI-ASBA application needs for one
// person: PAN, holder name, demat details and the UPI ID that approves the
// mandate. The profile is the payload a partner intermediary (e.g. Meon IPO)
// consumes when the in-app application flow goes live.

export type InvestorProfile = {
  id: string;
  pan: string;
  holderName: string;
  dematProvider: "CDSL" | "NSDL" | null;
  dematClientId: string;
  upiId: string;
  createdAt: string;
};

const STORAGE_KEY = "ipobharosa.investor-profiles.v1";

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const UPI_PATTERN = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;
// Full demat client ID is DP ID + BO ID combined: 16 digits for CDSL,
// 14 digits for NSDL. The DP and BO parts alone are not enough for UPI-ASBA.
export const DEMAT_CLIENT_ID_PATTERN: Record<"CDSL" | "NSDL", RegExp> = {
  CDSL: /^[0-9]{16}$/,
  NSDL: /^[0-9]{14}$/,
};

export function normalizePan(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeUpiId(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function isValidPan(value: string): boolean {
  return PAN_PATTERN.test(normalizePan(value));
}

export function isValidUpiId(value: string): boolean {
  return UPI_PATTERN.test(normalizeUpiId(value));
}

export function isValidDematClientId(value: string, provider: "CDSL" | "NSDL" | null): boolean {
  if (!provider) return false;
  return DEMAT_CLIENT_ID_PATTERN[provider].test(value.trim());
}

export function generateProfileId(): string {
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

export async function loadInvestorProfiles(): Promise<InvestorProfile[]> {
  const raw = await readStore(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveInvestorProfiles(profiles: InvestorProfile[]): Promise<void> {
  await writeStore(STORAGE_KEY, JSON.stringify(profiles));
}

export async function addInvestorProfile(input: {
  pan: string;
  holderName: string;
  dematProvider: "CDSL" | "NSDL" | null;
  dematClientId: string;
  upiId: string;
}): Promise<InvestorProfile> {
  const pan = normalizePan(input.pan);
  const upiId = normalizeUpiId(input.upiId);
  const profile: InvestorProfile = {
    id: generateProfileId(),
    pan,
    holderName: input.holderName.trim(),
    dematProvider: input.dematProvider,
    dematClientId: input.dematClientId.trim(),
    upiId,
    createdAt: new Date().toISOString(),
  };
  const profiles = await loadInvestorProfiles();
  const duplicate = profiles.some((p) => p.pan === pan || p.upiId === upiId);
  if (duplicate) throw new Error("A profile with this PAN or UPI ID already exists");
  await saveInvestorProfiles([...profiles, profile]);
  return profile;
}

export async function updateInvestorProfile(id: string, patch: Partial<Pick<InvestorProfile, "holderName" | "dematProvider" | "dematClientId" | "upiId">>): Promise<InvestorProfile | null> {
  const profiles = await loadInvestorProfiles();
  const index = profiles.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const updated: InvestorProfile = {
    ...profiles[index],
    ...(patch.upiId !== undefined ? { upiId: normalizeUpiId(patch.upiId) } : {}),
    ...patch,
  };
  profiles[index] = updated;
  await saveInvestorProfiles(profiles);
  return updated;
}

export async function removeInvestorProfile(id: string): Promise<void> {
  const profiles = await loadInvestorProfiles();
  await saveInvestorProfiles(profiles.filter((p) => p.id !== id));
}

// For an OPEN IPO, the application amount is lots x the upper price band.
export function applicationAmount(ipo: { lotSize: number; priceBandHigh: number }, lots: number): number {
  return ipo.lotSize * lots * ipo.priceBandHigh;
}