import { prisma } from "@/lib/prisma";
import { getCatalogue } from "@/lib/allotment-core/catalogue";
import type { RegistrarCompany, RegistrarKey } from "@/lib/allotment-core/catalogue/types";
import { normalizedNamesMatch } from "@/lib/gmp/name-match";

/**
 * Allotment-launch detector. A registrar's allotment-status portal only
 * publishes a company once allotment results are actually out — so when a
 * closed/listed IPO's company shows up in its registrar's live catalogue,
 * allotment has launched and users can check their PAN.
 */

const REGISTRAR_MATCHES: { match: string; key: RegistrarKey; label: string }[] = [
  { match: "kfin", key: "kfin", label: "KFinTech" },
  { match: "bigshare", key: "bigshare", label: "Bigshare" },
  { match: "maashitla", key: "maashitla", label: "Maashitla" },
  { match: "mufg", key: "mufg", label: "MUFG / Link Intime" },
  { match: "link intime", key: "mufg", label: "MUFG / Link Intime" },
  { match: "cameo", key: "cameo", label: "Cameo Corporate" },
  { match: "skyline", key: "skyline", label: "Skyline Financial" },
  { match: "purva", key: "purva", label: "Purva Sharegistry" },
  { match: "mas", key: "mas", label: "MAS Services" },
];

export function registrarCatalogueKey(registrar: string | null): { key: RegistrarKey; label: string } | null {
  if (!registrar) return null;
  const lower = registrar.toLowerCase();
  return REGISTRAR_MATCHES.find((entry) => lower.includes(entry.match)) ?? null;
}

export function catalogueContains(catalogue: RegistrarCompany[], companyName: string): boolean {
  return catalogue.some((company) => normalizedNamesMatch(companyName, company.name));
}

export type AllotmentLaunchCheck = {
  checkedAt: string;
  launched: { ipoId: string; companyName: string; registrar: string; registrarKey: RegistrarKey }[];
  notLaunched: { ipoId: string; companyName: string; registrar: string }[];
  unknownRegistrar: { ipoId: string; companyName: string; registrar: string | null }[];
};

/**
 * Scans every closed/listed IPO against its registrar's live allotment
 * catalogue. Any company present in the catalogue has allotment results out.
 */
export async function checkAllotmentLaunches(now = new Date()): Promise<AllotmentLaunchCheck> {
  const published = await prisma.ipo.findMany({
    where: { publicationState: "PUBLISHED", status: { in: ["CLOSED", "LISTED"] } },
    select: { id: true, company: { select: { name: true } }, status: true, registrar: true },
  });

  const launched: AllotmentLaunchCheck["launched"] = [];
  const notLaunched: AllotmentLaunchCheck["notLaunched"] = [];
  const unknownRegistrar: AllotmentLaunchCheck["unknownRegistrar"] = [];

  // Group by registrar key so we fetch each catalogue at most once per run.
  const byKey = new Map<RegistrarKey, typeof published>();
  for (const ipo of published) {
    const mapped = registrarCatalogueKey(ipo.registrar);
    if (!mapped) {
      unknownRegistrar.push({ ipoId: ipo.id, companyName: ipo.company.name, registrar: ipo.registrar });
      continue;
    }
    const list = byKey.get(mapped.key) ?? [];
    list.push(ipo);
    byKey.set(mapped.key, list);
  }

  for (const [key, ipos] of byKey) {
    let catalogue: RegistrarCompany[] = [];
    try {
      catalogue = await getCatalogue(key, { force: true });
    } catch {
      // Catalogue fetch failing should not sink the whole check; the
      // per-registrar health monitor already flags the outage.
      catalogue = [];
    }
    for (const ipo of ipos) {
      const isLive = catalogueContains(catalogue, ipo.company.name);
      if (isLive) {
        launched.push({
          ipoId: ipo.id,
          companyName: ipo.company.name,
          registrar: ipo.registrar ?? "",
          registrarKey: key,
        });
      } else {
        notLaunched.push({ ipoId: ipo.id, companyName: ipo.company.name, registrar: ipo.registrar ?? "" });
      }
    }
  }

  return { checkedAt: now.toISOString(), launched, notLaunched, unknownRegistrar };
}