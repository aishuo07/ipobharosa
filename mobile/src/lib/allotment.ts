import type { BoardIpo } from "@/src/lib/types";

export type AllotmentStatus = "ALLOTTED" | "NOT_ALLOTTED" | "NOT_APPLIED" | "ERROR";

export type AllotmentResult = {
  pan: string;
  companyName: string;
  registrar: string | null;
  status: AllotmentStatus;
  applied?: string;
  allotted?: string;
  amount?: string;
  applicant?: string;
  error?: string;
  checkedAt: string;
};

export type RegistrarCheck = {
  automatable: boolean;
  portalUrl: string | null;
};

const MUFG_ENDPOINTS = {
  companyList: "https://in.mpms.mufg.com/Initial_Offer/IPO.aspx/GetDetails",
  search: "https://in.mpms.mufg.com/Initial_Offer/IPO.aspx/SearchOnPan",
  origin: "https://in.mpms.mufg.com",
  referer: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
};

// Registrars that enforce a CAPTCHA must not be automated (source-policy:
// never bypass provider access controls). They are surfaced as deep links.
const PORTAL_LINKS: Record<string, string> = {
  KFin: "https://ipostatus.kfintech.com",
  KFintech: "https://ipostatus.kfintech.com",
  "KFin Technologies": "https://ipostatus.kfintech.com",
  Bigshare: "https://ipo.bigshareonline.com/ipo_status.html",
  "Bigshare Services": "https://ipo.bigshareonline.com/ipo_status.html",
  Cameo: "https://ipostatus.cameoindia.com",
  Skyline: "https://www.skylinerta.com/ipo.php",
  Maashitla: "https://maashitla.com/allotment-status/public-issues",
  Purva: "https://www.purvashare.com/investor-service/ipo-query",
};

const MUFG_KEYWORDS = ["mufg", "link intime", "intime"];

export function registrarCheck(ipo: BoardIpo): RegistrarCheck {
  const registrar = ipo.registrar?.toLowerCase() ?? "";
  if (registrar && MUFG_KEYWORDS.some((keyword) => registrar.includes(keyword))) {
    return { automatable: true, portalUrl: "https://linkintime.co.in/initial_offer/public-issues.html" };
  }
  for (const [name, url] of Object.entries(PORTAL_LINKS)) {
    if (ipo.registrar && ipo.registrar.toLowerCase().includes(name.toLowerCase())) {
      return { automatable: false, portalUrl: url };
    }
  }
  return { automatable: false, portalUrl: "https://www.bseindia.com/investors/appli_check.aspx" };
}

function unwrapD(json: unknown): unknown {
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

function parseXmlRows(xml: string): Record<string, string>[] {
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

function pick(obj: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!obj) return undefined;
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(obj)) map.set(key.toUpperCase(), value);
  for (const key of keys) {
    const value = map.get(key.toUpperCase());
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return undefined;
}

type MufgCompany = { id: string; name: string };

async function mufgCompanyList(): Promise<MufgCompany[]> {
  const response = await fetch(MUFG_ENDPOINTS.companyList, {
    method: "POST",
    headers: {
      "User-Agent": "IPOBharosa-mobile/1.0",
      "X-Requested-With": "XMLHttpRequest",
      Origin: MUFG_ENDPOINTS.origin,
      Referer: MUFG_ENDPOINTS.referer,
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
    body: JSON.stringify({ clienttype: "-1" }),
  });
  if (!response.ok) throw new Error(`MUFG company list HTTP ${response.status}`);
  const data = unwrapD(await response.json());
  const rows = Array.isArray(data) ? data : (data as { Table?: unknown[] })?.Table ?? [];
  return rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: pick(record, ["CLIENTID", "CLIENT_ID", "COMPANYID", "COMPANY_ID", "ID"]) ?? "",
        name: pick(record, ["COMPANYNAME", "COMPANY_NAME", "NAME"]) ?? "",
      };
    })
    .filter((company) => company.id && company.name);
}

function findCompanyId(companies: MufgCompany[], companyName: string): string | null {
  const needle = companyName.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const exact = companies.find((company) => company.name.toLowerCase().trim() === companyName.toLowerCase().trim());
  if (exact) return exact.id;
  const tokenized = needle.split(/\s+/).filter(Boolean);
  const ranked = companies
    .map((company) => {
      const name = company.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      const tokens = name.split(/\s+/).filter(Boolean);
      const overlap = tokenized.filter((token) => tokens.includes(token)).length;
      return { company, overlap, ratio: tokens.length ? overlap / Math.max(tokens.length, tokenized.length) : 0 };
    })
    .sort((a, b) => b.overlap - a.overlap || b.ratio - a.ratio);
  const best = ranked[0];
  return best && best.overlap >= 2 ? best.company.id : null;
}

async function mufgSearch(companyId: string, pan: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(MUFG_ENDPOINTS.search, {
    method: "POST",
    headers: {
      "User-Agent": "IPOBharosa-mobile/1.0",
      "X-Requested-With": "XMLHttpRequest",
      Origin: MUFG_ENDPOINTS.origin,
      Referer: MUFG_ENDPOINTS.referer,
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
    body: JSON.stringify({
      clientid: companyId,
      PAN: pan,
      IFSC: "",
      CHKVAL: "1",
      token: "",
    }),
  });
  if (!response.ok) throw new Error(`MUFG lookup HTTP ${response.status}`);
  const data = unwrapD(await response.json());
  const rows = Array.isArray(data) ? data : (data as { Table?: unknown[] })?.Table ?? [];
  return rows.length ? (rows[0] as Record<string, unknown>) : null;
}

function resultFromRow(ipo: BoardIpo, pan: string, row: Record<string, unknown>): AllotmentResult {
  const applied = pick(row, ["APPLIED", "APPLIED_QTY", "SHARES_APPLIED", "SHARES", "QTY"]);
  const allotted = pick(row, ["ALLOT", "ALLOTED", "ALLOTTED", "SHARES_ALLOTTED", "ALLOT_QTY"]);
  const amount = pick(row, ["AMTADJ", "AMOUNTADJUSTED", "AMT_ADJUSTED", "AMOUNT"]);
  const applicant = pick(row, ["NAME1", "NAME", "APPLICANTNAME", "APPLICANT_NAME"]);
  const allottedNum = parseInt(String(allotted ?? "0").replace(/[^0-9-]/g, ""), 10) || 0;
  return {
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: allottedNum > 0 ? "ALLOTTED" : "NOT_ALLOTTED",
    applied: applied ?? "",
    allotted: allotted ?? "0",
    amount: amount ?? "",
    applicant: applicant ?? "",
    checkedAt: new Date().toISOString(),
  };
}

export async function checkMufgAllotment(ipo: BoardIpo, pan: string): Promise<AllotmentResult> {
  const base: AllotmentResult = {
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: "ERROR",
    checkedAt: new Date().toISOString(),
  };
  try {
    const companies = await mufgCompanyList();
    const companyId = findCompanyId(companies, ipo.companyName);
    if (!companyId) {
      return { ...base, error: "Company not found in MUFG list (allotment may not be out yet)" };
    }
    const row = await mufgSearch(companyId, pan);
    if (!row) return { ...base, status: "NOT_APPLIED" };
    return resultFromRow(ipo, pan, row);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ...base, error: message };
  }
}

/**
 * Checks allotment for every saved PAN against one IPO in a single batch.
 * The MUFG company list is fetched once and reused for all PANs. Each
 * result should be cached (via the caller) keyed by PAN for the next visit.
 */
export async function checkMufgAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  const base = (pan: string): AllotmentResult => ({
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: "ERROR",
    checkedAt: new Date().toISOString(),
  });
  try {
    const companies = await mufgCompanyList();
    const companyId = findCompanyId(companies, ipo.companyName);
    if (!companyId) {
      const error = "Company not found in MUFG list (allotment may not be out yet)";
      return pans.map((pan) => ({ ...base(pan), error }));
    }
    const results: AllotmentResult[] = [];
    for (const pan of pans) {
      try {
        const row = await mufgSearch(companyId, pan);
        results.push(row ? resultFromRow(ipo, pan, row) : { ...base(pan), status: "NOT_APPLIED" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        results.push({ ...base(pan), error: message });
      }
    }
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return pans.map((pan) => ({ ...base(pan), error: message }));
  }
}