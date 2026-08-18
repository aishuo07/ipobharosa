import type { BoardIpo, AllotmentResult } from "../types";
import { getCatalogue } from "../catalogue";
import { registrarKind, findCompanyId, parseXmlRows } from "../utils";

const MUFG_ENDPOINTS = {
  origin: "https://in.mpms.mufg.com",
  referer: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
};

const KFIN_API = "https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan";
const KFIN_REFERER = "https://ipostatus.kfintech.com/";

const BIGSHARE_ENDPOINT = "https://ipo.bigshareonline.com/Data.aspx/FetchIpodetails";

const MAASHITLA_API = "https://api.maashitla.com";

function mufgHeaders() {
  return {
    "User-Agent": "IPOBharosa/1.0",
    "X-Requested-With": "XMLHttpRequest",
    Origin: MUFG_ENDPOINTS.origin,
    Referer: MUFG_ENDPOINTS.referer,
    "Content-Type": "application/json; charset=UTF-8",
    Accept: "application/json, text/javascript, */*; q=0.01",
  };
}

async function mufgCompanyList(): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${MUFG_ENDPOINTS.origin}/Initial_Offer/IPO.aspx/GetDetails`, {
    method: "POST",
    headers: mufgHeaders(),
    body: JSON.stringify({ clienttype: "-1" }),
  });
  if (!res.ok) throw new Error(`MUFG company list HTTP ${res.status}`);
  const data = await res.json();
  let d = (data as { d?: unknown })?.d;
  if (d === undefined) d = data;
  if (typeof d === "string") {
    const trimmed = d.trim();
    if (trimmed.startsWith("<")) {
      d = parseXmlRows(d);
    } else {
      try { d = JSON.parse(d); } catch {}
    }
  }
  const rows = Array.isArray(d) ? d : (d as { Table?: unknown[] })?.Table ?? [];
  return rows
    .map((row: { [key: string]: unknown }) => ({
      id: String(row.company_id ?? row.COMPANYID ?? row.COMPANY_ID ?? row.ID ?? ""),
      name: String(row.companyname ?? row.COMPANYNAME ?? row.COMPANY_NAME ?? row.NAME ?? ""),
    }))
    .filter((c) => c.id && c.name);
}

async function mufgSearch(companyId: string, pan: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${MUFG_ENDPOINTS.origin}/Initial_Offer/IPO.aspx/SearchOnPan`, {
    method: "POST",
    headers: mufgHeaders(),
    body: JSON.stringify({ clientid: companyId, PAN: pan, IFSC: "", CHKVAL: "1", token: "" }),
  });
  if (!res.ok) throw new Error(`MUFG lookup HTTP ${res.status}`);
  const data = await res.json();
  let d = (data as { d?: unknown })?.d;
  if (d === undefined) d = data;
  if (typeof d === "string") {
    const trimmed = d.trim();
    if (trimmed.startsWith("<")) {
      d = parseXmlRows(d);
    } else {
      try { d = JSON.parse(d); } catch {}
    }
  }
  const rows = Array.isArray(d) ? d : (d as { Table?: unknown[] })?.Table ?? [];
  return rows.length ? (rows[0] as Record<string, unknown>) : null;
}

async function kfintechSearch(clientId: string, pan: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${KFIN_API}`, {
    method: "GET",
    headers: {
      reqparam: pan,
      client_id: clientId,
      referer: KFIN_REFERER,
      Accept: "application/json, text/plain, */*",
    },
  });
  if (!res.ok) throw new Error(`KFinTech lookup HTTP ${res.status}`);
  const json = (await res.json()) as { data?: unknown[]; error?: string };
  if (Array.isArray(json.data) && json.data.length > 0) return json.data[0] as Record<string, unknown>;
  if (json.error) return null;
  return null;
}

async function bigshareSearch(companyCode: string, pan: string): Promise<Record<string, unknown> | null> {
  const body = JSON.stringify({
    Applicationno: "",
    Company: companyCode,
    SelectionType: "PN",
    PanNo: pan,
    txtcsdl: "",
    txtDPID: "",
    txtClId: "",
    ddlType: "",
    lang: "en",
  });
  const res = await fetch(BIGSHARE_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": "IPOBharosa/1.0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://ipo.bigshareonline.com",
      Referer: "https://ipo.bigshareonline.com/ipo_status.html",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) throw new Error(`Bigshare lookup HTTP ${res.status}`);
  const json = (await res.json()) as { d?: { DPID?: string; Name?: string; APPLIED?: string; ALLOTED?: string; APPLICATION_NO?: string } };
  const d = json.d;
  if (!d) return null;
  if (d.DPID === "No data found") return null;
  return d as unknown as Record<string, unknown>;
}

async function maashitlaSearch(companyId: string, pan: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${MAASHITLA_API}/api/public-issue/search?company_name=${encodeURIComponent(companyId)}&pan=${encodeURIComponent(pan)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Maashitla lookup HTTP ${res.status}`);
  const json = (await res.json()) as { detail?: string; company_name?: string; pan?: string; name?: string; shares_applied?: number; shares_alloted?: number; application_no?: string; dpid_client_id?: string };
  if (json.detail === "No records found.") return null;
  if (json.name) return json as unknown as Record<string, unknown>;
  return null;
}

function resultFromRow(ipo: BoardIpo, pan: string, row: Record<string, unknown>, keys: { applied: string[]; allotted: string[]; applicant: string[]; amount: string[] }): AllotmentResult {
  const applied = pick(row, keys.applied);
  const allotted = pick(row, keys.allotted);
  const applicant = pick(row, keys.applicant);
  const amount = pick(row, keys.amount);
  const allottedNum = parseInt(String(allotted ?? "0").replace(/[^0-9-]/g, ""), 10) || 0;
  return {
    pan,
    companyName: ipo.companyName,
    registrar: ipo.registrar,
    status: allottedNum > 0 ? "ALLOTTED" : "NOT_ALLOTTED",
    applied: applied ?? "",
    allotted: allotted ?? "0",
    applicant: applicant ?? "",
    amount: amount ?? "",
    checkedAt: new Date().toISOString(),
  };
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

async function checkMufgAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  const base = (pan: string) => ({ pan, companyName: ipo.companyName, registrar: ipo.registrar, status: "ERROR" as const, checkedAt: new Date().toISOString() });
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
        results.push(row ? resultFromRow(ipo, pan, row, {
          applied: ["APPLIED", "APPLIED_QTY", "SHARES_APPLIED", "SHARES", "QTY"],
          allotted: ["ALLOT", "ALLOTED", "ALLOTTED", "SHARES_ALLOTTED", "ALLOT_QTY"],
          applicant: ["NAME1", "NAME", "APPLICANTNAME", "APPLICANT_NAME"],
          amount: ["AMTADJ", "AMOUNTADJUSTED", "AMT_ADJUSTED", "AMOUNT"],
        }) : { ...base(pan), status: "NOT_APPLIED" });
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

async function checkKfintechAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  const base = (pan: string) => ({ pan, companyName: ipo.companyName, registrar: ipo.registrar, status: "ERROR" as const, checkedAt: new Date().toISOString() });
  const companies = await getCatalogue("kfin");
  const clientId = findCompanyId(companies, ipo.companyName);
  if (!clientId) {
    const error = "Company not found in KFinTech list (allotment may not be out yet)";
    return pans.map((pan) => ({ ...base(pan), error }));
  }
  const results: AllotmentResult[] = [];
  for (const pan of pans) {
    try {
      const row = await kfintechSearch(clientId, pan);
      results.push(row ? resultFromRow(ipo, pan, row, {
        applied: ["APP_SHARES", "APPLIED", "APPLIED_QTY"],
        allotted: ["ALL_SHARES", "ALLOT", "ALLOTED", "ALLOTTED"],
        applicant: ["NAME", "NAME1"],
        amount: ["APPLN_NO", "APPLICATION_NO", "APPLICATIONNUMBER"],
      }) : { ...base(pan), status: "NOT_APPLIED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ ...base(pan), error: message });
    }
  }
  return results;
}

async function checkBigshareAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  const base = (pan: string) => ({ pan, companyName: ipo.companyName, registrar: ipo.registrar, status: "ERROR" as const, checkedAt: new Date().toISOString() });
  const companies = await getCatalogue("bigshare");
  const companyCode = findCompanyId(companies, ipo.companyName);
  if (!companyCode) {
    const error = "Company not found in Bigshare list (allotment may not be out yet)";
    return pans.map((pan) => ({ ...base(pan), error }));
  }
  const results: AllotmentResult[] = [];
  for (const pan of pans) {
    try {
      const row = await bigshareSearch(companyCode, pan);
      results.push(row ? resultFromRow(ipo, pan, row, {
        applied: ["APPLIED"],
        allotted: ["ALLOTED", "ALLOT", "ALLOTTED"],
        applicant: ["NAME", "NAME1"],
        amount: ["APPLICATION_NO", "APPLN_NO"],
      }) : { ...base(pan), status: "NOT_APPLIED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ ...base(pan), error: message });
    }
  }
  return results;
}

async function checkMaashitlaAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  const base = (pan: string) => ({ pan, companyName: ipo.companyName, registrar: ipo.registrar, status: "ERROR" as const, checkedAt: new Date().toISOString() });
  const companies = await getCatalogue("maashitla");
  const companyId = findCompanyId(companies, ipo.companyName);
  if (!companyId) {
    const error = "Company not found in Maashitla list (allotment may not be out yet)";
    return pans.map((pan) => ({ ...base(pan), error }));
  }
  const results: AllotmentResult[] = [];
  for (const pan of pans) {
    try {
      const row = await maashitlaSearch(companyId, pan);
      results.push(row ? resultFromRow(ipo, pan, row, {
        applied: ["SHARES_APPLIED", "shares_applied"],
        allotted: ["SHARES_ALLOTED", "SHARES_ALLOTTED", "shares_alloted"],
        applicant: ["NAME", "name"],
        amount: ["APPLICATION_NO", "application_no"],
      }) : { ...base(pan), status: "NOT_APPLIED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({ ...base(pan), error: message });
    }
  }
  return results;
}

export async function checkAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  
  const kind = registrarKind(ipo);
  if (kind === "manual") {
    const base = (pan: string) => ({
      pan,
      companyName: ipo.companyName,
      registrar: ipo.registrar,
      status: "ERROR" as const,
      error: `Automatic checking is not supported for ${ipo.registrar ?? "this registrar"}. Open the registrar's portal instead.`,
      checkedAt: new Date().toISOString(),
    });
    return pans.map(base);
  }
  
  try {
    switch (kind) {
      case "mufg":
        return checkMufgAllotmentForPans(ipo, pans);
      case "kfintech":
        return checkKfintechAllotmentForPans(ipo, pans);
      case "bigshare":
        return checkBigshareAllotmentForPans(ipo, pans);
      case "maashitla":
        return checkMaashitlaAllotmentForPans(ipo, pans);
      default: {
        const base = (pan: string) => ({
          pan,
          companyName: ipo.companyName,
          registrar: ipo.registrar,
          status: "ERROR" as const,
          error: `Automatic checking is not supported for ${ipo.registrar ?? "this registrar"}`,
          checkedAt: new Date().toISOString(),
        });
        return pans.map(base);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const base = (pan: string) => ({
      pan,
      companyName: ipo.companyName,
      registrar: ipo.registrar,
      status: "ERROR" as const,
      error: message,
      checkedAt: new Date().toISOString(),
    });
    return pans.map(base);
  }
}
