import type { RegistrarCompany } from "./catalogue/types";

export function unwrapD(json: unknown): unknown {
  let d = (json as { d?: unknown })?.d;
  if (d === undefined) d = json;
  if (typeof d === "string") {
    const trimmed = d.trim();
    if (trimmed.startsWith("<")) {
      return parseXmlRows(d);
    }
    try {
      return JSON.parse(d);
    } catch {
      /* leave as string */
    }
  }
  return d;
}

export function parseXmlRows(xml: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const tableRe = /<Table\b[^>]*>([\s\S]*?)<\/Table>/gi;
  const fieldRe = /<([A-Za-z0-9_]+)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRe.exec(xml)) !== null) {
    const record: Record<string, string> = {};
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRe.exec(tableMatch[1])) !== null) {
      record[fieldMatch[1].toUpperCase()] = fieldMatch[2];
    }
    if (Object.keys(record).length) rows.push(record);
  }
  return rows;
}

export function pick(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(obj)) map.set(key.toUpperCase(), value);
  for (const key of keys) {
    const value = map.get(key.toUpperCase());
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return undefined;
}

const NAME_NORMALIZATIONS: Record<string, string> = {
  ltd: "limited",
  pvt: "private",
  corp: "corporation",
  co: "company",
  ind: "industries",
  tech: "technologies",
  techs: "technologies",
};

export function normalizeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned
    .split(" ")
    .map((token) => NAME_NORMALIZATIONS[token] ?? token)
    .join(" ");
}

export function findCompanyId(companies: RegistrarCompany[], companyName: string): string | null {
  const needle = normalizeName(companyName);
  const exact = companies.find((company) => normalizeName(company.name) === needle);
  if (exact) return exact.id;
  const tokenized = needle.split(/\s+/).filter(Boolean);
  const ranked = companies
    .map((company) => {
      const name = normalizeName(company.name);
      const tokens = name.split(/\s+/).filter(Boolean);
      const overlap = tokenized.filter((token) => tokens.includes(token)).length;
      return { company, overlap, ratio: tokens.length ? overlap / Math.max(tokens.length, tokenized.length) : 0 };
    })
    .sort((a, b) => b.overlap - a.overlap || b.ratio - a.ratio);
  const best = ranked[0];
  return best && best.overlap >= 2 ? best.company.id : null;
}

export function registrarKind(ipo: { registrar?: string | null }): "mufg" | "kfintech" | "bigshare" | "maashitla" | "manual" {
  const registrar = ipo.registrar?.toLowerCase() ?? "";
  if (registrar.includes("mufg") || registrar.includes("intime") || registrar.includes("link intime")) return "mufg";
  if (registrar.includes("kfin")) return "kfintech";
  if (registrar.includes("bigshare")) return "bigshare";
  if (registrar.includes("maashitla")) return "maashitla";
  return "manual";
}
