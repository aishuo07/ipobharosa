import type { BoardIpo } from "@/src/lib/types";
import { getApiUrl } from "@/src/lib/api";

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

export type RegistrarKind = "mufg" | "kfintech" | "bigshare" | "maashitla" | "manual";

export type { AllotmentResult as ServerAllotmentResult };

async function checkAllotmentViaServer(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  const response = await fetch(`${getApiUrl()}/api/allotment/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: ipo.slug, pans }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Server allotment check failed: ${error}`);
  }
  return response.json();
}

export async function checkAllotmentForPans(ipo: BoardIpo, pans: string[]): Promise<AllotmentResult[]> {
  if (pans.length === 0) return [];
  try {
    return await checkAllotmentViaServer(ipo, pans);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return pans.map((pan) => ({
      pan,
      companyName: ipo.companyName,
      registrar: ipo.registrar,
      status: "ERROR" as const,
      error: message,
      checkedAt: new Date().toISOString(),
    }));
  }
}

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
};

const PORTAL_LINKS: Record<string, string> = {
  Cameo: "https://ipostatus.cameoindia.com",
  Skyline: "https://www.skylinerta.com/ipo.php",
  Purva: "https://www.purvashare.com/investor-service/ipo-query",
};

export function registrarKind(ipo: BoardIpo): RegistrarKind {
  const registrar = ipo.registrar?.toLowerCase() ?? "";
  if (registrar.includes("mufg") || registrar.includes("intime") || registrar.includes("link intime")) return "mufg";
  if (registrar.includes("kfin")) return "kfintech";
  if (registrar.includes("bigshare")) return "bigshare";
  if (registrar.includes("maashitla")) return "maashitla";
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

export const checkMufgAllotmentForPans = checkAllotmentForPans;
export const checkKfintechAllotmentForPans = checkAllotmentForPans;
export const checkBigshareAllotmentForPans = checkAllotmentForPans;
export const checkMaashitlaAllotmentForPans = checkAllotmentForPans;
export { checkAllotmentForPans as checkMufgAllotment };

export { getApiUrl };
