import type { RegistrarCompany } from "@/src/lib/registrar-catalog";
import { fetchRegistrarCatalogue } from "@/src/lib/catalogue-store";
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

// All registrars are now automated — no portal links needed
const PORTAL_LINKS: Record<string, string> = {};

const AUTOMATABLE: Record<string, { portalUrl: string }> = {
  mufg: { portalUrl: "https://linkintime.co.in/initial_offer/public-issues.html" },
  "link intime": { portalUrl: "https://linkintime.co.in/initial_offer/public-issues.html" },
  intime: { portalUrl: "https://linkintime.co.in/initial_offer/public-issues.html" },
  kfin: { portalUrl: "https://ipostatus.kfintech.com" },
  kfintech: { portalUrl: "https://ipostatus.kfintech.com" },
  "kfin technologies": { portalUrl: "https://ipostatus.kfintech.com" },
  bigshare: { portalUrl: "https://ipo.bigshareonline.com/ipo_status.html" },
  "bigshare services": { portalUrl: "https://ipo.bigshareonline.com/ipo_status.html" },
  maashitla: { portalUrl: "https://maashitla.com/allotment-status/public-issues" },
  "maashitla securities": { portalUrl: "https://maashitla.com/allotment-status/public-issues" },
  mas: { portalUrl: "https://www.masserv.com/ipo_asearch.asp" },
  "mas services": { portalUrl: "https://www.masserv.com/ipo_asearch.asp" },
  cameo: { portalUrl: "https://ipostatus.cameoindia.com" },
  "cameo corporate": { portalUrl: "https://ipostatus.cameoindia.com" },
  skyline: { portalUrl: "https://www.skylinerta.com/ipo.php" },
  "skyline financial": { portalUrl: "https://www.skylinerta.com/ipo.php" },
  purva: { portalUrl: "https://www.purvashare.com/investor-service/ipo-query" },
  "purva sharegistry": { portalUrl: "https://www.purvashare.com/investor-service/ipo-query" },
};

export type RegistrarKind = "mufg" | "kfintech" | "bigshare" | "maashitla" | "mas" | "cameo" | "skyline" | "purva" | "manual";

export function registrarKind(ipo: BoardIpo): RegistrarKind {
  const registrar = ipo.registrar?.toLowerCase() ?? "";
  if (registrar.includes("mufg") || registrar.includes("intime") || registrar.includes("link intime")) return "mufg";
  if (registrar.includes("kfin")) return "kfintech";
  if (registrar.includes("bigshare")) return "bigshare";
  if (registrar.includes("maashitla")) return "maashitla";
  if (registrar.includes("mas")) return "mas";
  if (registrar.includes("cameo")) return "cameo";
  if (registrar.includes("skyline")) return "skyline";
  if (registrar.includes("purva")) return "purva";
  return "manual";
}

export function registrarCheck(ipo: BoardIpo): RegistrarCheck {
  const kind = registrarKind(ipo);
  if (kind === "manual") {
    const registrar = ipo.registrar?.toLowerCase() ?? "";
    for (const [name, url] of Object.entries(PORTAL_LINKS)) {
      if (registrar.includes(name.toLowerCase())) return { automatable: false, portalUrl: url };
    }
    return { automatable: false, portalUrl: "https://www.bseindia.com/investors/appli_check.aspx" };
  }
  return { automatable: true, portalUrl: AUTOMATABLE[kind].portalUrl };
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

type MufgCompany = RegistrarCompany;

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

const NAME_NORMALIZATIONS: Record<string, string> = {
  ltd: "limited",
  pvt: "private",
  corp: "corporation",
  co: "company",
  ind: "industries",
  tech: "technologies",
  techs: "technologies",
};

function normalizeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned
    .split(" ")
    .map((token) => NAME_NORMALIZATIONS[token] ?? token)
    .join(" ");
}

function findCompanyId(companies: RegistrarCompany[], companyName: string): string | null {
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

const KFIN_API = "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan";
const KFIN_REFERER = "https://ipostatus.kfintech.com/";

/**
 * KFinTech allotment lookup. Their new portal (ipostatus.kfintech.com) calls a
 * public Lambda API keyed by PAN via the `reqparam` header and the issue's
 * `client_id`. No CAPTCHA, no auth. Response is either
 * `{"data":[{All_Shares, App_Shares, Appln_No, DP_CLID, Name, Pan_No}]}` or
 * `{"error":"Record Not Found"}`.
 */
async function kfintechSearch(clientId: string, pan: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${KFIN_API}`, {
    method: "GET",
    headers: {
      reqparam: pan,
      client_id: clientId,
      referer: KFIN_REFERER,
      Accept: "application/json, text/plain, */*",
    },
  });
  if (!response.ok) throw new Error(`KFinTech lookup HTTP ${response.status}`);
  const json = (await response.json()) as { data?: unknown[]; error?: string };
  if (Array.isArray(json.data) && json.data.length > 0) return json.data[0] as Record<string, unknown>;
  if (json.error) return null; // "Record Not Found" -> not applied
  return null;
}

function kfintechResult(ipo: BoardIpo, pan: string, row: Record<string, unknown>): AllotmentResult {
  const applied = pick(row, ["APP_SHARES", "APPLIED", "APPLIED_QTY"]);
  const allotted = pick(row, ["ALL_SHARES", "ALLOT", "ALLOTED", "ALLOTTED"]);
  const applicant = pick(row, ["NAME", "NAME1"]);
  const applnNo = pick(row, ["APPLN_NO", "APPLICATION_NO", "APPLICATIONNUMBER"]);
  const allottedNum = parseInt(String(allotted ?? "0").replace(/[^0-9-]/g, ""), 10) || 0;
  return {
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: allottedNum > 0 ? "ALLOTTED" : "NOT_ALLOTTED",
    applied: applied ?? "",
    allotted: allotted ?? "0",
    applicant: applicant ?? "",
    amount: applnNo ?? "",
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Checks every saved PAN against a KFinTech IPO. The clientId catalogue is
 * matched once for all PANs; a fresh one is fetched from the server when the
 * caller does not provide one.
 */
export async function checkKfintechAllotmentForPans(ipo: BoardIpo, pans: string[], companies?: RegistrarCompany[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  const base = (pan: string): AllotmentResult => ({
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: "ERROR",
    checkedAt: new Date().toISOString(),
  });
  const catalogue = companies ?? (await fetchRegistrarCatalogue("kfin"));
  const clientId = findCompanyId(catalogue, ipo.companyName);
  if (!clientId) {
    const error = "Company not found in KFinTech list (allotment may not be out yet)";
    return pans.map((pan) => ({ ...base(pan), error }));
  }
  const results: AllotmentResult[] = [];
  for (const pan of pans) {
    try {
      const row = await kfintechSearch(clientId, pan);
      results.push(row ? kfintechResult(ipo, pan, row) : { ...base(pan), status: "NOT_APPLIED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ ...base(pan), error: message });
    }
  }
  return results;
}

const BIGSHARE_ENDPOINT = "https://ipo.bigshareonline.com/Data.aspx/FetchIpodetails";

/**
 * Bigshare allotment lookup. Their portal's CAPTCHA is validated purely
 * client-side (never sent to the server), so the JSON API is callable
 * directly. PAN lookup uses SelectionType "PN".
 */
async function bigshareSearch(companyCode: string, pan: string): Promise<Record<string, unknown> | null> {
  const body = `{ Applicationno: '',Company: '${companyCode}',SelectionType: 'PN',PanNo: '${pan}', txtcsdl: '', txtDPID: '', txtClId: '',ddlType:'',lang: 'en' }`;
  const response = await fetch(BIGSHARE_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": "IPOBharosa-mobile/1.0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://ipo.bigshareonline.com",
      Referer: "https://ipo.bigshareonline.com/ipo_status.html",
      Accept: "application/json",
    },
    body,
  });
  if (!response.ok) throw new Error(`Bigshare lookup HTTP ${response.status}`);
  const json = (await response.json()) as { d?: { DPID?: string; Name?: string; APPLIED?: string; ALLOTED?: string; APPLICATION_NO?: string } };
  const d = json.d;
  if (!d) return null;
  if (d.DPID === "No data found") return null;
  return d as unknown as Record<string, unknown>;
}

function bigshareResult(ipo: BoardIpo, pan: string, row: Record<string, unknown>): AllotmentResult {
  const applied = pick(row, ["APPLIED"]);
  const allotted = pick(row, ["ALLOTED", "ALLOT", "ALLOTTED"]);
  const applicant = pick(row, ["NAME", "NAME1"]);
  const applnNo = pick(row, ["APPLICATION_NO", "APPLN_NO"]);
  const allottedNum = parseInt(String(allotted ?? "0").replace(/[^0-9-]/g, ""), 10) || 0;
  return {
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: allottedNum > 0 ? "ALLOTTED" : "NOT_ALLOTTED",
    applied: applied ?? "",
    allotted: allotted ?? "0",
    applicant: applicant ?? "",
    amount: applnNo ?? "",
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Checks every saved PAN against a Bigshare IPO. The company code catalogue is
 * matched once for all PANs; a fresh one is fetched when not provided.
 */
export async function checkBigshareAllotmentForPans(ipo: BoardIpo, pans: string[], companies?: RegistrarCompany[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  const base = (pan: string): AllotmentResult => ({
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: "ERROR",
    checkedAt: new Date().toISOString(),
  });
  const catalogue = companies ?? (await fetchRegistrarCatalogue("bigshare"));
  const companyCode = findCompanyId(catalogue, ipo.companyName);
  if (!companyCode) {
    const error = "Company not found in Bigshare list (allotment may not be out yet)";
    return pans.map((pan) => ({ ...base(pan), error }));
  }
  const results: AllotmentResult[] = [];
  for (const pan of pans) {
    try {
      const row = await bigshareSearch(companyCode, pan);
      results.push(row ? bigshareResult(ipo, pan, row) : { ...base(pan), status: "NOT_APPLIED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ ...base(pan), error: message });
    }
  }
  return results;
}

const MAASHITLA_API = "https://api.maashitla.com";

/**
 * Maashitla Securities allotment lookup. Their public API at api.maashitla.com
 * is fully open — no CAPTCHA, CORS enabled, no auth required.
 * Endpoints: GET /api/public-issue/companies, GET /api/public-issue/search?company_name=X&pan=Y
 */
async function maashitlaSearch(companyId: string, pan: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${MAASHITLA_API}/api/public-issue/search?company_name=${encodeURIComponent(companyId)}&pan=${encodeURIComponent(pan)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Maashitla lookup HTTP ${response.status}`);
  const json = (await response.json()) as { detail?: string; company_name?: string; pan?: string; name?: string; shares_applied?: number; shares_alloted?: number; application_no?: string; dpid_client_id?: string };
  if (json.detail === "No records found.") return null;
  if (json.name) return json as unknown as Record<string, unknown>;
  return null;
}

function maashitlaResult(ipo: BoardIpo, pan: string, row: Record<string, unknown>): AllotmentResult {
  const applied = pick(row, ["SHARES_APPLIED", "shares_applied"]);
  const allotted = pick(row, ["SHARES_ALLOTED", "SHARES_ALLOTTED", "shares_alloted"]);
  const applicant = pick(row, ["NAME", "name"]);
  const applnNo = pick(row, ["APPLICATION_NO", "application_no"]);
  const allottedNum = parseInt(String(allotted ?? "0").replace(/[^0-9-]/g, ""), 10) || 0;
  return {
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: allottedNum > 0 ? "ALLOTTED" : "NOT_ALLOTTED",
    applied: applied ?? "",
    allotted: allotted ?? "0",
    applicant: applicant ?? "",
    amount: applnNo ?? "",
    checkedAt: new Date().toISOString(),
  };
}

export async function checkMaashitlaAllotmentForPans(ipo: BoardIpo, pans: string[], companies?: RegistrarCompany[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  const base = (pan: string): AllotmentResult => ({
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: "ERROR",
    checkedAt: new Date().toISOString(),
  });
  const catalogue = companies ?? (await fetchRegistrarCatalogue("maashitla"));
  const companyId = findCompanyId(catalogue, ipo.companyName);
  if (!companyId) {
    const error = "Company not found in Maashitla list (allotment may not be out yet)";
    return pans.map((pan) => ({ ...base(pan), error }));
  }
  const results: AllotmentResult[] = [];
  for (const pan of pans) {
    try {
      const row = await maashitlaSearch(companyId, pan);
      results.push(row ? maashitlaResult(ipo, pan, row) : { ...base(pan), status: "NOT_APPLIED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ ...base(pan), error: message });
    }
  }
  return results;
}

/**
 * Dispatches a batch allotment check to the right registrar adapter based on
 * the IPO's registrar. IPOs on non-automatable registrars get an ERROR result
 * (the UI deep-links to their portal instead). Lookups stay client-side so
 * each user checks from their own IP; the dynamic catalogue is fetched once
 * per registrar from the server to keep company matching reliable.
 */
async function checkMasAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  const base = (pan: string): AllotmentResult => ({
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: "ERROR",
    checkedAt: new Date().toISOString(),
  });

  const results: AllotmentResult[] = [];
  for (const pan of pans) {
    try {
      const formData = new URLSearchParams();
      formData.append("texthn", pan.toUpperCase());
      const upstream = await fetch("https://www.masserv.com/ipo_search1.asp", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "IPOBharosa/1.0",
          Referer: "https://www.masserv.com/ipo_asearch.asp",
        },
        body: formData.toString(),
      });
      if (!upstream.ok) {
        results.push({ ...base(pan), error: `HTTP ${upstream.status}` });
        continue;
      }
      const html = await upstream.text();
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      let found = false;
      while ((rowMatch = rowRegex.exec(html)) !== null) {
        const cells = rowMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (cells && cells.length >= 3) {
          const clean = (s: string) => s.replace(/<[^>]+>/g, "").trim();
          const company = clean(cells[0] ?? "");
          const status = clean(cells[1] ?? "");
          const shares = clean(cells[2] ?? "");
          const amount = clean(cells[3] ?? "");
          if (company.toLowerCase().includes(ipo.companyName.toLowerCase())) {
            results.push({
              pan,
              companyName: ipo.companyName,
              registrar: ipo.registrar,
              status: status.toUpperCase().includes("ALLOTTED") ? "ALLOTTED" : status.toUpperCase().includes("NOT") ? "NOT_ALLOTTED" : "NOT_APPLIED",
              allotted: shares,
              amount,
              checkedAt: new Date().toISOString(),
            });
            found = true;
            break;
          }
        }
      }
      if (!found) results.push({ ...base(pan), status: "NOT_APPLIED" });
    } catch {
      results.push({ ...base(pan), error: "Network error" });
    }
  }
  return results;
}

const SERVER_BASE = "https://ipobharosa.vercel.app";

async function serverRegistrarSearch(registrar: string, pan: string, companyCode: string): Promise<{ ok: boolean; results?: { company: string; status: string; shares: string; amount: string }[]; error?: string }> {
  const res = await fetch(`${SERVER_BASE}/api/registrar/${registrar}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ PAN: pan, company_code: companyCode }),
  });
  return res.json();
}

async function checkServerRegistrarAllotment(ipo: BoardIpo, pans: string[], registrar: string): Promise<AllotmentResult[]> {
  const base = (pan: string): AllotmentResult => ({
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: "ERROR",
    checkedAt: new Date().toISOString(),
  });

  const results: AllotmentResult[] = [];
  for (const pan of pans) {
    try {
      const data = await serverRegistrarSearch(registrar, pan, ipo.companyName);
      if (data.ok && data.results) {
        const match = data.results.find((r) => r.company.toLowerCase().includes(ipo.companyName.toLowerCase()));
        if (match) {
          results.push({
            pan,
            companyName: ipo.companyName,
            registrar: ipo.registrar,
            status: match.status.toUpperCase().includes("ALLOTTED") ? "ALLOTTED" : match.status.toUpperCase().includes("NOT") ? "NOT_ALLOTTED" : "NOT_APPLIED",
            allotted: match.shares,
            amount: match.amount,
            checkedAt: new Date().toISOString(),
          });
        } else {
          results.push({ ...base(pan), status: "NOT_APPLIED" });
        }
      } else {
        results.push({ ...base(pan), error: data.error || "Server error" });
      }
    } catch {
      results.push({ ...base(pan), error: "Network error" });
    }
  }
  return results;
}

export async function checkAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  const kind = registrarKind(ipo);
  switch (kind) {
    case "mufg":
      return checkMufgAllotmentForPans(ipo, pans);
    case "maashitla": {
      const catalogue = await fetchRegistrarCatalogue("maashitla");
      return checkMaashitlaAllotmentForPans(ipo, pans, catalogue);
    }
    case "mas": {
      return checkMasAllotmentForPans(ipo, pans);
    }
    case "kfintech":
    case "bigshare":
    case "cameo":
    case "skyline":
    case "purva": {
      // These registrars have CAPTCHAs or complex APIs — solved by our server
      return checkServerRegistrarAllotment(ipo, pans, kind === "kfintech" ? "kfin" : kind);
    }
    default: {
      const base = (pan: string): AllotmentResult => ({
        pan,
        companyName: ipo.companyName,
        registrar: ipo.registrar,
        status: "ERROR",
        error: `Automatic checking is not supported for ${ipo.registrar ?? "this registrar"}. Open the registrar's portal instead.`,
        checkedAt: new Date().toISOString(),
      });
      return pans.map(base);
    }
  }
}