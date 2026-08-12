const LEGAL_SUFFIXES = new Set([
  "limited",
  "ltd",
  "private",
  "pvt",
  "incorporated",
  "inc",
  "company",
  "co",
]);

export function normalizeIssuerName(value: string): string {
  const words = value
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words.at(-1)!)) words.pop();
  return words.join(" ");
}

export function normalizeComparableText(value: string): string {
  return normalizeIssuerName(value).replace(/\s+/g, " ");
}

export function parseInteger(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function parsePriceBand(value: string | null | undefined): { low: number; high: number } | null {
  if (!value) return null;
  const numbers = [...value.replace(/,/g, "").matchAll(/(?:Rs\.?|₹)\s*(\d+(?:\.\d+)?)/gi)].map((match) => Number(match[1]));
  if (numbers.length === 0) {
    const fallback = value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    if (fallback.length === 0) return null;
    return { low: fallback[0], high: fallback[1] ?? fallback[0] };
  }
  return { low: numbers[0], high: numbers[1] ?? numbers[0] };
}

export function parseIndianDate(value: string | null | undefined): Date {
  if (!value) throw new Error("missing date");
  const match = value.trim().match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (!match) throw new Error(`unsupported NSE date: ${value}`);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(match[2].slice(0, 3).toLowerCase());
  if (month < 0) throw new Error(`unsupported NSE month: ${match[2]}`);
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
}

export function splitManagers(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^"|"$/g, "")
    .split(/,|\s+and\s+/i)
    .map((manager) => manager.trim())
    .filter(Boolean);
}
