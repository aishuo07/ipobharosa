import type { RegistrarCompany, RegistrarKey } from "./types";
import { parseXmlRows } from "../utils";

const RETRY_DELAY = 1000;
const TIMEOUT = 15000;

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 1): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
  throw new Error("Unreachable");
}

export async function fetchKfinCatalogue(): Promise<RegistrarCompany[]> {
  // Step 1: Fetch the portal page to get the main.js URL
  const pageRes = await fetchWithRetry("https://ipostatus.kfintech.com/");
  const html = await pageRes.text();
  
  // Extract main.js URL from script tag
  const scriptMatch = html.match(/<script[^>]+src=["']([^"']+main[^"']*\.js)["']/);
  if (!scriptMatch) throw new Error("KFinTech: Could not find main.js in portal HTML");
  
  const jsUrl = scriptMatch[1].startsWith("http") ? scriptMatch[1] : `https://ipostatus.kfintech.com${scriptMatch[1]}`;
  
  // Step 2: Fetch the JS bundle and extract clientId map
  const jsRes = await fetchWithRetry(jsUrl);
  const js = await jsRes.text();
  
  // Pattern: clientId":"86153103110","name":"SHIPROCKET LIMITED"
  const companies: RegistrarCompany[] = [];
  const regex = /clientId":"(\d+)","name":"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(js)) !== null) {
    companies.push({ id: match[1], name: match[2] });
  }
  
  if (companies.length === 0) throw new Error("KFinTech: No companies extracted from JS bundle");
  return companies;
}

export async function fetchBigshareCatalogue(): Promise<RegistrarCompany[]> {
  const res = await fetchWithRetry("https://ipo.bigshareonline.com/ipo_status.html");
  const html = await res.text();
  
  // The dropdown has id="ddlCompany" (not "Company" as the old snapshot expected)
  const selectMatch = html.match(/<select[^>]*id=["']ddlCompany["'][^>]*>([\s\S]*?)<\/select>/i);
  if (!selectMatch) throw new Error("Bigshare: Could not find ddlCompany dropdown");
  
  const companies: RegistrarCompany[] = [];
  const optionRegex = /<option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = optionRegex.exec(selectMatch[1])) !== null) {
    const value = match[1].trim();
    const name = match[2].trim();
    if (value && name && value !== "" && !name.startsWith("--Select")) {
      companies.push({ id: value, name });
    }
  }
  
  if (companies.length === 0) throw new Error("Bigshare: No companies extracted from dropdown");
  return companies;
}

export async function fetchMaashitlaCatalogue(): Promise<RegistrarCompany[]> {
  const res = await fetchWithRetry("https://api.maashitla.com/api/public-issue/companies");
  const data = await res.json();
  
  if (!Array.isArray(data)) throw new Error("Maashitla: Invalid response format");
  
  return data.map((c: { company_id: unknown; company_name: unknown }) => ({
    id: String(c.company_id ?? ""),
    name: String(c.company_name ?? ""),
  })).filter((c) => c.id && c.name);
}

export async function fetchMufgCatalogue(): Promise<RegistrarCompany[]> {
  const res = await fetchWithRetry("https://in.mpms.mufg.com/Initial_Offer/IPO.aspx/GetDetails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://in.mpms.mufg.com",
      Referer: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html",
      Accept: "application/json, text/javascript, */*; q=0.01",
    },
    body: JSON.stringify({ clienttype: "-1" }),
  });
  
  const json = await res.json();
  let d = (json as { d?: unknown })?.d;
  if (d === undefined) d = json;
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

export async function fetchCatalogue(key: RegistrarKey): Promise<RegistrarCompany[]> {
  switch (key) {
    case "kfin": return fetchKfinCatalogue();
    case "bigshare": return fetchBigshareCatalogue();
    case "maashitla": return fetchMaashitlaCatalogue();
    case "mufg": return fetchMufgCatalogue();
    default: throw new Error(`Unknown registrar: ${key}`);
  }
}
