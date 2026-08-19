import { toIpoSlug } from "@/lib/ipo-slug";

/**
 * Normalised-name comparison for unofficial GMP sources. Provider catalogues
 * often use the full legal name ("Gaja Alternative Asset Management") while
 * our board stores a shorter display name ("Gaja Alternative"). Exact slug
 * equality is checked first; a robust prefix/containment fallback catches
 * these mismatches without risking false positives from short names.
 */
export function normalizedNamesMatch(boardName: string, providerName: string): boolean {
  const a = toIpoSlug(boardName);
  const b = toIpoSlug(providerName);
  if (!a || !b) return false;
  if (a === b) return true;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  // Require a reasonably distinctive core so "gaja-alternative" matches
  // "gaja-alternative-asset-management" but a stray generic token never does.
  if (longer.startsWith(shorter) && shorter.split("-").length >= 2) return true;
  if (longer.endsWith(shorter) && shorter.split("-").length >= 2) return true;

  const aTokens = a.split("-").filter((token) => token.length > 2);
  const bTokens = b.split("-").filter((token) => token.length > 2);
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  const overlap = aTokens.filter((token) => bTokens.includes(token)).length;
  const ratio = overlap / Math.min(aTokens.length, bTokens.length);
  return overlap >= 2 && ratio >= 0.6;
}