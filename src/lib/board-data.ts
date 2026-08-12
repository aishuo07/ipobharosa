import { prisma } from "@/lib/prisma";
import { toIpoSlug } from "@/lib/ipo-slug";
import { filingEvidenceLabel, filingSourceHost } from "@/lib/document-evidence";

export type BoardIpo = {
  id: string;
  slug: string;
  companyName: string;
  sector: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
  board: "MAINBOARD" | "SME";
  priceBandLow: number;
  priceBandHigh: number;
  lotSize: number;
  issueSizeCr: number;
  freshIssueCr: number | null;
  ofsCr: number | null;
  openDate: string;
  closeDate: string;
  allotmentDate: string;
  refundDate: string;
  listingDate: string;
  listingPrice: number | null;
  registrar: string | null;
  leadManagers: string[];
  gmp: {
    medianValue: number;
    sourceCount: number;
    maxDeviation: number;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    capturedAt: string;
  } | null;
  subscription: {
    qibX: number | null;
    niiX: number | null;
    retailX: number | null;
    employeeX: number | null;
    capturedAt: string;
  } | null;
  gmpHistory: { value: number; capturedAt: string }[];
  documents: { label: string; url: string; docType: string; evidenceLabel: string; sourceHost: string }[];
  financials: {
    fiscalYear: string;
    revenueCr: number | null;
    patCr: number | null;
    peRatio: number | null;
    ronwPct: number | null;
    debtEquity: number | null;
    eps: number | null;
    verified: boolean;
  }[];
  provenance: {
    discovery: { name: string; url: string; note: string }[];
    gmp: { name: string; url: string; note: string }[];
    subscription: { name: string; url: string; note: string } | null;
  };
};

function toNum(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}
function toNumOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

const IPO_INCLUDE = {
  company: true,
  gmpSnapshots: { orderBy: { capturedAt: "asc" as const } },
  subscriptionSnapshots: { orderBy: { capturedAt: "desc" as const }, take: 1 },
  documents: true,
  financialSnapshots: { orderBy: { fiscalYear: "desc" as const } },
  gmpObservations: { orderBy: { capturedAt: "desc" as const }, take: 12, include: { source: true } },
};

type IpoWithRelations = Awaited<ReturnType<typeof prisma.ipo.findFirstOrThrow<{ include: typeof IPO_INCLUDE }>>>;

function shapeIpo(ipo: IpoWithRelations): BoardIpo {
  const latestGmp = ipo.gmpSnapshots[ipo.gmpSnapshots.length - 1] ?? null;
  const latestSub = ipo.subscriptionSnapshots[0] ?? null;
  const slug = toIpoSlug(ipo.company.name);
  const gmpSourceLinks = new Map<string, { name: string; url: string; note: string }>();
  for (const observation of ipo.gmpObservations) {
    if (!observation.success || gmpSourceLinks.has(observation.source.adapterKey)) continue;
    const url = observation.source.adapterKey === "ipowatch"
      ? `https://ipowatch.in/${slug}-ipo-gmp-grey-market-premium/`
      : observation.source.adapterKey === "sahi"
        ? `https://www.sahi.com/blogs/${slug}-ipo-gmp-today`
        : observation.source.adapterKey === "ipoji"
          ? `https://www.ipoji.com/ipo/${slug}-ipo`
          : observation.source.baseUrl;
    if (url.startsWith("https://")) gmpSourceLinks.set(observation.source.adapterKey, {
      name: observation.source.name,
      url,
      note: `Successful observation captured ${observation.capturedAt.toISOString()}`,
    });
  }
  const discovery = ipo.sourceUrl ? [{
    name: "IPO Watch listing facts",
    url: ipo.sourceUrl,
    note: `Discovered from ${ipo.discoveredFrom.join(" + ") || "stored source"}`,
  }] : [];

  return {
    id: ipo.id,
    slug,
    companyName: ipo.company.name,
    sector: ipo.company.sector ?? "",
    status: ipo.status,
    board: ipo.board,
    priceBandLow: toNum(ipo.priceBandLow),
    priceBandHigh: toNum(ipo.priceBandHigh),
    lotSize: ipo.lotSize ?? 0,
    issueSizeCr: toNum(ipo.issueSizeCr),
    freshIssueCr: toNumOrNull(ipo.freshIssueCr),
    ofsCr: toNumOrNull(ipo.ofsCr),
    openDate: ipo.openDate?.toISOString() ?? "",
    closeDate: ipo.closeDate?.toISOString() ?? "",
    allotmentDate: ipo.allotmentDate?.toISOString() ?? "",
    refundDate: ipo.refundDate?.toISOString() ?? "",
    listingDate: ipo.listingDate?.toISOString() ?? "",
    listingPrice: toNumOrNull(ipo.listingPrice),
    registrar: ipo.registrar,
    leadManagers: ipo.leadManagers,
    gmp: latestGmp
      ? {
          medianValue: toNum(latestGmp.medianValue),
          sourceCount: latestGmp.sourceCount,
          maxDeviation: toNum(latestGmp.maxDeviation),
          confidence: latestGmp.confidence,
          capturedAt: latestGmp.capturedAt.toISOString(),
        }
      : null,
    subscription: latestSub
      ? {
          qibX: toNumOrNull(latestSub.qibX),
          niiX: toNumOrNull(latestSub.niiX),
          retailX: toNumOrNull(latestSub.retailX),
          employeeX: toNumOrNull(latestSub.employeeX),
          capturedAt: latestSub.capturedAt.toISOString(),
        }
      : null,
    gmpHistory: ipo.gmpSnapshots.map((s) => ({
      value: toNum(s.medianValue),
      capturedAt: s.capturedAt.toISOString(),
    })),
    documents: ipo.documents.map((d) => ({
      label: d.label,
      url: d.url,
      docType: d.docType,
      evidenceLabel: filingEvidenceLabel(d.url),
      sourceHost: filingSourceHost(d.url),
    })),
    financials: ipo.financialSnapshots.map((f) => ({
      fiscalYear: f.fiscalYear,
      revenueCr: toNumOrNull(f.revenueCr),
      patCr: toNumOrNull(f.patCr),
      peRatio: toNumOrNull(f.peRatio),
      ronwPct: toNumOrNull(f.ronwPct),
      debtEquity: toNumOrNull(f.debtEquity),
      eps: toNumOrNull(f.eps),
      verified: f.verified,
    })),
    provenance: {
      discovery,
      gmp: [...gmpSourceLinks.values()],
      subscription: latestSub ? {
        name: "Sahi subscription table",
        url: `https://www.sahi.com/blogs/${slug}-ipo-gmp-today`,
        note: `${latestSub.sourceExchange.toUpperCase()}-attributed data captured ${latestSub.capturedAt.toISOString()}`,
      } : null,
    },
  };
}

export async function getBoardIpos(): Promise<BoardIpo[]> {
  const ipos = await prisma.ipo.findMany({
    where: { publicationState: "PUBLISHED" },
    include: IPO_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return ipos.map(shapeIpo);
}

// No dedicated slug column exists yet — company count is small enough
// that computing the slug for every IPO and matching is simpler than a
// migration.
export async function getBoardIpoBySlug(slug: string): Promise<BoardIpo | null> {
  const ipos = await getBoardIpos();
  return ipos.find((ipo) => ipo.slug === slug) ?? null;
}

export async function getWatchlistIpos(userId: string): Promise<BoardIpo[]> {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    include: { ipo: { include: IPO_INCLUDE } },
    orderBy: { createdAt: "desc" },
  });
  return items.map((item) => shapeIpo(item.ipo));
}
