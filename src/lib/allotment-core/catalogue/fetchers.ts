import type { RegistrarCompany, RegistrarKey } from "./types";
import { parseXmlRows } from "./utils";

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
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("Unreachable");
}

export async function fetchKfinCatalogue(): Promise<RegistrarCompany[]> {
  const pageRes = await fetchWithRetry("https://ipostatus.kfintech.com/");
  const html = await pageRes.text();

  const scriptMatch = html.match(/<script[^>]+src=["']([^"']+main[^"']*\.js)["']/);
  if (!scriptMatch) throw new Error("KFinTech: Could not find main.js in portal HTML");

  const jsUrl = scriptMatch[1].startsWith("http") ? scriptMatch[1] : `https://ipostatus.kfintech.com${scriptMatch[1]}`;

  const jsRes = await fetchWithRetry(jsUrl);
  const js = await jsRes.text();

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

  return data
    .map((c: { company_id?: unknown; company_name?: unknown }) => ({
      id: String(c.company_id ?? ""),
      name: String(c.company_name ?? ""),
    }))
    .filter((c) => c.id && c.name);
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
      try {
        d = JSON.parse(d);
      } catch {}
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
    case "kfin":
      return fetchKfinCatalogue();
    case "bigshare":
      return fetchBigshareCatalogue();
    case "maashitla":
      return fetchMaashitlaCatalogue();
    case "mufg":
      return fetchMufgCatalogue();
    case "mas":
      return fetchMasCatalogue();
    case "purva":
      return fetchPurvaCatalogue();
    case "cameo":
      return fetchCameoCatalogue();
    case "skyline":
      return fetchSkylineCatalogue();
    default:
      throw new Error(`Unknown registrar: ${key}`);
  }
}

// ─── MAS Services (no CAPTCHA) ────────────────────────────────────────────────

export async function fetchMasCatalogue(): Promise<RegistrarCompany[]> {
  // MAS has a PAN search form but no company catalogue endpoint.
  // We scrape the IPO listing page to get available companies.
  const res = await fetchWithRetry("https://www.masserv.com/opt.asp");
  const html = await res.text();

  const companies: RegistrarCompany[] = [];
  const regex = /<option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const id = match[1].trim();
    const name = match[2].trim();
    if (id && name && !name.startsWith("--") && !name.startsWith("Select")) {
      companies.push({ id, name });
    }
  }

  if (companies.length === 0) throw new Error("MAS: No companies found on listing page");
  return companies;
}

// ─── Purva Sharegistry (math CAPTCHA — solved server-side) ────────────────────

export async function fetchPurvaCatalogue(): Promise<RegistrarCompany[]> {
  // Purva uses AngularJS with AJAX calls. The company list is loaded via XHR.
  // We scrape the main page to extract company options from the AngularJS app.
  const res = await fetchWithRetry("https://www.purvashare.com/investor-service/ipo-query");
  const html = await res.text();

  const companies: RegistrarCompany[] = [];
  // Look for company options in the HTML (ng-options or select elements)
  const optionRegex = /<option[^>]*value=["']([^"']*)["'][^>]*>([^<]+)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = optionRegex.exec(html)) !== null) {
    const id = match[1].trim();
    const name = match[2].trim();
    if (id && name && !name.startsWith("--") && !name.startsWith("Select") && name !== "") {
      companies.push({ id, name });
    }
  }

  // Also try to find company data in AngularJS JSON
  const jsonMatch = html.match(/var\s+companies\s*=\s*(\[[\s\S]*?\]);/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      for (const c of data) {
        if (c.id || c.company_id || c.name || c.company_name) {
          companies.push({
            id: String(c.id || c.company_id || ""),
            name: String(c.name || c.company_name || ""),
          });
        }
      }
    } catch {}
  }

  if (companies.length === 0) throw new Error("Purva: No companies found on query page");
  // Deduplicate
  const seen = new Set<string>();
  return companies.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Cameo Corporate Services (image CAPTCHA) ────────────────────────────────

export async function fetchCameoCatalogue(): Promise<RegistrarCompany[]> {
  const res = await fetchWithRetry("https://ipostatus1.cameoindia.com/");
  const html = await res.text();

  const companies: RegistrarCompany[] = [];
  // Cameo uses ASP.NET — company dropdown is drpCompany
  const selectMatch = html.match(/<select[^>]*id=["']drpCompany["'][^>]*>([\s\S]*?)<\/select>/i);
  if (selectMatch) {
    const optionRegex = /<option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi;
    let match: RegExpExecArray | null;
    while ((match = optionRegex.exec(selectMatch[1])) !== null) {
      const id = match[1].trim();
      const name = match[2].trim();
      if (id && name && !name.startsWith("--")) {
        companies.push({ id, name });
      }
    }
  }

  if (companies.length === 0) throw new Error("Cameo: No companies found on status page");
  return companies;
}

// ─── Skyline Financial Services (image CAPTCHA) ──────────────────────────────

export async function fetchSkylineCatalogue(): Promise<RegistrarCompany[]> {
  const res = await fetchWithRetry("https://www.skylinerta.com/ipo.php");
  const html = await res.text();

  const companies: RegistrarCompany[] = [];
  const selectMatch = html.match(/<select[^>]*name=["']company["'][^>]*>([\s\S]*?)<\/select>/i)
    || html.match(/<select[^>]*id=["']company["'][^>]*>([\s\S]*?)<\/select>/i);

  if (selectMatch) {
    const optionRegex = /<option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi;
    let match: RegExpExecArray | null;
    while ((match = optionRegex.exec(selectMatch[1])) !== null) {
      const id = match[1].trim();
      const name = match[2].trim();
      if (id && name && !name.startsWith("--") && !name.startsWith("Select")) {
        companies.push({ id, name });
      }
    }
  }

  if (companies.length === 0) throw new Error("Skyline: No companies found on IPO page");
  return companies;
}
