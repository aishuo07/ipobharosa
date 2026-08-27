import { prisma } from "@/lib/prisma";
import { normalizeIssuerName } from "./official/normalization";
import { fetchSebiFilingCatalogue, type OfficialFilingEntry } from "./official/sebi-catalogue";
import { publicVerificationFromPublicationState, type PublicVerificationState } from "@/lib/public-verification";
import { toIpoSlug } from "@/lib/ipo-slug";

export type FilingRadarEntry = {
  id: string;
  companyName: string;
  stage: "DRHP_FILED" | "RHP_FILED";
  filingDate: string;
  source: string;
  sourceUrl: string;
  documentUrl: string | null;
  linkedIpo: {
    slug: string;
    verificationState: PublicVerificationState;
    verificationLabel: string;
  } | null;
};

export type FilingCatalogueSync = {
  seen: number;
  stored: number;
  linked: number;
  error?: string;
};

let fallbackCache: { expiresAt: number; entries: OfficialFilingEntry[] } | null = null;

function newestPerIssuer(entries: FilingRadarEntry[]): FilingRadarEntry[] {
  const byIssuer = new Map<string, FilingRadarEntry>();
  for (const entry of entries) {
    const key = normalizeIssuerName(entry.companyName);
    const current = byIssuer.get(key);
    const entryRank = entry.stage === "RHP_FILED" ? 2 : 1;
    const currentRank = current?.stage === "RHP_FILED" ? 2 : 1;
    if (!current || entryRank > currentRank || (entryRank === currentRank && entry.filingDate > current.filingDate)) {
      byIssuer.set(key, entry);
    }
  }
  return [...byIssuer.values()].sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

function shapeFetched(entries: OfficialFilingEntry[]): FilingRadarEntry[] {
  return newestPerIssuer(entries.map((entry) => ({
    id: `sebi:${entry.sourceUrl}`,
    companyName: entry.companyName,
    stage: entry.stage,
    filingDate: entry.filingDate.toISOString(),
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    documentUrl: entry.documentUrl,
    linkedIpo: null,
  })));
}

async function fallbackEntries(): Promise<FilingRadarEntry[]> {
  if (!fallbackCache || Date.now() >= fallbackCache.expiresAt) {
    fallbackCache = { entries: await fetchSebiFilingCatalogue(), expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
  }
  return shapeFetched(fallbackCache.entries);
}

export async function syncOfficialFilingCatalogue(): Promise<FilingCatalogueSync> {
  try {
    const entries = await fetchSebiFilingCatalogue();
    const ipos = await prisma.ipo.findMany({ select: { id: true, company: { select: { name: true } } } });
    const ipoByIssuer = new Map(ipos.map((ipo) => [normalizeIssuerName(ipo.company.name), ipo.id]));
    let linked = 0;
    await prisma.$transaction(entries.map((entry) => {
      const ipoId = ipoByIssuer.get(entry.issuerKey) ?? null;
      if (ipoId) linked++;
      return prisma.ipoFilingCatalogue.upsert({
        where: { sourceUrl: entry.sourceUrl },
        create: { ...entry, ipoId },
        update: {
          issuerKey: entry.issuerKey,
          companyName: entry.companyName,
          stage: entry.stage,
          filingDate: entry.filingDate,
          documentUrl: entry.documentUrl,
          raw: entry.raw,
          ipoId,
          lastSeenAt: new Date(),
        },
      });
    }), { timeout: 30000 });
    return { seen: entries.length, stored: entries.length, linked };
  } catch (error) {
    return { seen: 0, stored: 0, linked: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getFilingRadarEntries(): Promise<FilingRadarEntry[]> {
  try {
    const entries = await prisma.ipoFilingCatalogue.findMany({
      orderBy: { filingDate: "desc" },
      take: 150,
      include: { ipo: { select: {
        publicationState: true,
        quarantineReason: true,
        priceBandLow: true,
        priceBandHigh: true,
        lotSize: true,
        issueSizeCr: true,
        openDate: true,
        closeDate: true,
        allotmentDate: true,
        refundDate: true,
        listingDate: true,
        registrar: true,
        company: { select: { name: true } },
      } } },
    });
    if (entries.length > 0) {
      return newestPerIssuer(entries.map((entry) => {
        const ipo = entry.ipo;
        const complete = ipo && ipo.priceBandLow !== null && ipo.priceBandHigh !== null && ipo.lotSize !== null &&
          ipo.issueSizeCr !== null && ipo.openDate !== null && ipo.closeDate !== null && ipo.allotmentDate !== null &&
          ipo.refundDate !== null && ipo.listingDate !== null && ipo.registrar !== null;
        const verification = complete ? publicVerificationFromPublicationState({
          publicationState: ipo.publicationState,
          officialLastAttemptAt: null,
          officialNextAttemptAt: null,
          quarantineReason: ipo.quarantineReason,
        }) : null;
        return {
          id: entry.id,
          companyName: entry.companyName,
          stage: entry.stage,
          filingDate: entry.filingDate.toISOString(),
          source: entry.source,
          sourceUrl: entry.sourceUrl,
          documentUrl: entry.documentUrl,
          linkedIpo: verification ? {
            slug: toIpoSlug(ipo!.company.name),
            verificationState: verification.state,
            verificationLabel: verification.label,
          } : null,
        };
      }));
    }
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code !== "P2021" && code !== "P2022") throw error;
  }
  try {
    return await fallbackEntries();
  } catch {
    return [];
  }
}
