import { prisma } from "@/lib/prisma";
import { toIpoSlug } from "@/lib/ipo-slug";
import { filingEvidenceLabel, filingSourceHost } from "@/lib/document-evidence";
import { deriveGmpAvailability, type PublicSignalAvailability } from "@/lib/market-signal";
import { isGmpSourceEnabled } from "@/lib/source-policy";
import { publicVerificationFromPublicationState, type PublicVerification } from "@/lib/public-verification";
import { MATERIAL_OFFICIAL_FIELDS } from "@/lib/discovery/official/types";

export type BoardIpo = {
  id: string;
  slug: string;
  companyName: string;
  sector: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
  board: "MAINBOARD" | "SME";
  verification: PublicVerification;
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
    totalX?: number | null;
    capturedAt: string;
    sourceName?: string;
    sourceUrl?: string;
  } | null;
  gmpHistory: { value: number; capturedAt: string }[];
  gmpAvailability?: PublicSignalAvailability;
  documents: { label: string; url: string; docType: string; evidenceLabel: string; sourceHost: string }[];
  financials: {
    fiscalYear: string;
    revenueCr: number | null;
    patCr: number | null;
    ebitdaCr: number | null;
    assetsCr: number | null;
    netWorthCr: number | null;
    borrowingsCr: number | null;
    peRatio: number | null;
    ronwPct: number | null;
    debtEquity: number | null;
    eps: number | null;
    verified: boolean;
    sources: {
      url: string;
      documentType: string;
      pageNumber: number | null;
      approvedBy: string | null;
      verificationDate: string;
      metrics: string[];
    }[];
  }[];
  provenance: {
    discovery: { name: string; url: string; note: string }[];
    gmp: { name: string; url: string; note: string }[];
    subscription: { name: string; url: string; note: string } | null;
    officialFields: { field: string; value: string; source: string; url: string; checkedAt: string; status: "MATCH" | "CONFLICT" | "MISSING_OFFICIAL" }[];
    sourceChecks?: { source: string; status: string; reason: string | null; issueType: string | null; url: string | null; checkedAt: string }[];
    applicationFacts?: { label: string; value: string; source: string; url: string }[];
    officialDocuments?: { label: string; url: string; kind: string; source: string }[];
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
  publishedFinancials: {
    where: { revokedReason: null, supersededBy: null },
    orderBy: [{ fiscalYear: "desc" as const }, { publishedAt: "desc" as const }],
  },
  gmpObservations: { orderBy: { capturedAt: "desc" as const }, take: 12, include: { source: true } },
};

// Select public fields explicitly. This also keeps page reads compatible while
// an additive ingestion migration is rolling out and newer operational columns
// are not present in every preview database yet.
const IPO_SELECT = {
  id: true,
  status: true,
  board: true,
  publicationState: true,
  quarantineReason: true,
  discoveredFrom: true,
  priceBandLow: true,
  priceBandHigh: true,
  lotSize: true,
  issueSizeCr: true,
  freshIssueCr: true,
  ofsCr: true,
  openDate: true,
  closeDate: true,
  allotmentDate: true,
  refundDate: true,
  listingDate: true,
  listingPrice: true,
  registrar: true,
  leadManagers: true,
  sourceUrl: true,
  ...IPO_INCLUDE,
};

type IpoWithRelations = Awaited<ReturnType<typeof prisma.ipo.findFirstOrThrow<{ select: typeof IPO_SELECT }>>>;

type OfficialProvenance = {
  summaries: { name: string; url: string; note: string }[];
  fields: BoardIpo["provenance"]["officialFields"];
  sourceChecks: NonNullable<BoardIpo["provenance"]["sourceChecks"]>;
  applicationFacts: NonNullable<BoardIpo["provenance"]["applicationFacts"]>;
  officialDocuments: NonNullable<BoardIpo["provenance"]["officialDocuments"]>;
  demand: (BoardIpo["subscription"] & { sourceName: string; sourceUrl: string }) | null;
  matchedFields: number;
  providers: string[];
};

type OfficialOperations = {
  officialLastAttemptAt: Date | null;
  officialNextAttemptAt: Date | null;
};

function evidenceValue(value: string | null): string {
  if (value === null) return "—";
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return value;
  }
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function displayApplicationValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : null;
  if (typeof value === "number") return value.toLocaleString("en-IN");
  if (typeof value === "string") return value;
  return null;
}

const APPLICATION_LABELS: Record<string, string> = {
  issueType: "Issue type",
  symbol: "Exchange symbol",
  faceValue: "Face value (₹)",
  issueSizeShares: "Issue size (shares)",
  marketLot: "Exchange market lot",
  minimumBidQuantity: "Minimum bid quantity",
  maximumRetailAmount: "Maximum retail amount (₹)",
  maximumEmployeeAmount: "Maximum employee amount (₹)",
  maximumQibQuantity: "Maximum QIB quantity",
  maximumNiiQuantity: "Maximum NII quantity",
  employeeDiscount: "Employee discount",
  issueSizeDescription: "Fresh issue / OFS",
  marketTimings: "IPO market timings",
  upiMandateCutoff: "UPI mandate cut-off",
  sponsorBanks: "Sponsor banks",
};

function enrichmentProjection(enrichment: unknown, source: string, sourceUrl: string): {
  facts: OfficialProvenance["applicationFacts"];
  documents: OfficialProvenance["officialDocuments"];
  demand: OfficialProvenance["demand"];
} {
  const record = jsonRecord(enrichment);
  if (!record) return { facts: [], documents: [], demand: null };
  const facts = Object.entries(APPLICATION_LABELS).flatMap(([field, label]) => {
    const value = displayApplicationValue(record[field]);
    return value ? [{ label, value, source, url: sourceUrl }] : [];
  });
  const documents = Array.isArray(record.documents) ? record.documents.flatMap((value) => {
    const document = jsonRecord(value);
    return typeof document?.url === "string" && document.url.startsWith("https://")
      ? [{ label: String(document.label ?? "Official document"), url: document.url, kind: String(document.kind ?? "OTHER"), source }]
      : [];
  }) : [];
  const demand = jsonRecord(record.demand);
  const capturedAt = typeof demand?.capturedAt === "string" ? demand.capturedAt : null;
  const demandSourceUrl = typeof demand?.sourceUrl === "string" ? demand.sourceUrl : sourceUrl;
  return {
    facts,
    documents,
    demand: demand && capturedAt ? {
      qibX: toNumOrNull(demand.qibX),
      niiX: toNumOrNull(demand.niiX),
      retailX: toNumOrNull(demand.retailX),
      employeeX: toNumOrNull(demand.employeeX),
      totalX: toNumOrNull(demand.totalX),
      capturedAt,
      sourceName: `${source} official demand`,
      sourceUrl: demandSourceUrl,
    } : null,
  };
}

function shapeIpo(ipo: IpoWithRelations, officialProvenance?: OfficialProvenance, operations?: OfficialOperations): BoardIpo {
  const permittedGmpObservations = ipo.gmpObservations.filter((observation) => isGmpSourceEnabled(observation.source.adapterKey));
  const latestRawGmp = ipo.gmpSnapshots[ipo.gmpSnapshots.length - 1] ?? null;
  const latestGmp = latestRawGmp && permittedGmpObservations.some((observation) =>
    observation.success && observation.capturedAt.getTime() === latestRawGmp.capturedAt.getTime(),
  ) ? latestRawGmp : null;
  const slug = toIpoSlug(ipo.company.name);
  const storedSubscription = ipo.subscriptionSnapshots[0];
  const secondarySubscription: BoardIpo["subscription"] = storedSubscription ? {
    qibX: toNumOrNull(storedSubscription.qibX),
    niiX: toNumOrNull(storedSubscription.niiX),
    retailX: toNumOrNull(storedSubscription.retailX),
    employeeX: toNumOrNull(storedSubscription.employeeX),
    totalX: null,
    capturedAt: storedSubscription.capturedAt.toISOString(),
    sourceName: storedSubscription.sourceExchange === "nse-official" ? "NSE official issue demand" : "Legacy exchange-attributed snapshot",
    sourceUrl: storedSubscription.sourceExchange === "nse-official"
      ? "https://www.nseindia.com/market-data/all-upcoming-issues-ipo"
      : ipo.sourceUrl ?? "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
  } : null;
  const officialDemand = officialProvenance?.demand ?? null;
  const latestSub = officialDemand && (!secondarySubscription || new Date(officialDemand.capturedAt) >= new Date(secondarySubscription.capturedAt))
    ? officialDemand
    : secondarySubscription;
  const verification = publicVerificationFromPublicationState({
    publicationState: ipo.publicationState,
    officialLastAttemptAt: operations?.officialLastAttemptAt ?? null,
    officialNextAttemptAt: operations?.officialNextAttemptAt ?? null,
    quarantineReason: ipo.quarantineReason,
    officialContext: officialProvenance ? {
      matchedFields: officialProvenance.matchedFields,
      materialFields: MATERIAL_OFFICIAL_FIELDS.length,
      providers: officialProvenance.providers,
      attempts: officialProvenance.sourceChecks,
    } : undefined,
  });
  if (!verification) throw new Error("Rejected IPO cannot be shaped for public display");
  const gmpSourceLinks = new Map<string, { name: string; url: string; note: string }>();
  for (const observation of ipo.gmpObservations) {
    if (!observation.success || gmpSourceLinks.has(observation.source.adapterKey)) continue;
    const url = observation.source.adapterKey === "ipowatch"
      ? `https://ipowatch.in/${slug}-ipo-gmp-grey-market-premium/`
      : observation.source.adapterKey === "sahi"
        ? `https://www.sahi.com/blogs/${slug}-ipo-gmp-today`
        : observation.source.adapterKey === "ipoji"
          ? `https://www.ipoji.com/ipo/${slug}-ipo`
          : observation.source.adapterKey === "investorgain"
            ? "https://www.investorgain.com/report/ipo-gmp-live/331/"
          : observation.source.baseUrl;
    if (url.startsWith("https://")) gmpSourceLinks.set(observation.source.adapterKey, {
      name: observation.source.name,
      url,
      note: `Successful observation captured ${observation.capturedAt.toISOString()}`,
    });
  }
  const discovery = ipo.sourceUrl ? [{
    name: "Historical discovery evidence",
    url: ipo.sourceUrl,
    note: `Retained provenance from ${ipo.discoveredFrom.join(" + ") || "stored source"}; not evidence of current collection`,
  }] : [];
  if (officialProvenance) discovery.unshift(...officialProvenance.summaries);
  const publishedByYear = new Map<string, BoardIpo["financials"][number]>();
  for (const value of ipo.publishedFinancials) {
    const row = publishedByYear.get(value.fiscalYear) ?? {
      fiscalYear: value.fiscalYear,
      revenueCr: null,
      patCr: null,
      ebitdaCr: null,
      assetsCr: null,
      netWorthCr: null,
      borrowingsCr: null,
      peRatio: null,
      ronwPct: null,
      debtEquity: null,
      eps: null,
      verified: true,
      sources: [],
    };
    if (value.metric === "REVENUE") row.revenueCr = toNum(value.value);
    if (value.metric === "PAT") row.patCr = toNum(value.value);
    if (value.metric === "EPS") row.eps = toNum(value.value);
    if (value.metric === "EBITDA") row.ebitdaCr = toNum(value.value);
    if (value.metric === "ASSETS") row.assetsCr = toNum(value.value);
    if (value.metric === "NET_WORTH") row.netWorthCr = toNum(value.value);
    if (value.metric === "BORROWINGS") row.borrowingsCr = toNum(value.value);
    const existingSource = row.sources.find((source) => source.url === value.sourceUrl && source.pageNumber === value.pageNumber);
    if (existingSource) {
      if (!existingSource.metrics.includes(value.metric)) existingSource.metrics.push(value.metric);
    } else {
      row.sources.push({
        url: value.sourceUrl,
        documentType: value.sourceDocument,
        pageNumber: value.pageNumber,
        approvedBy: value.approvedBy,
        verificationDate: value.verificationDate.toISOString(),
        metrics: [value.metric],
      });
    }
    publishedByYear.set(value.fiscalYear, row);
  }

  return {
    id: ipo.id,
    slug,
    companyName: ipo.company.name,
    sector: ipo.company.sector ?? "",
    status: ipo.status,
    board: ipo.board,
    verification,
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
    subscription: latestSub,
    gmpHistory: ipo.gmpSnapshots.map((s) => ({
      value: toNum(s.medianValue),
      capturedAt: s.capturedAt.toISOString(),
    })),
    gmpAvailability: deriveGmpAvailability(permittedGmpObservations.map((observation) => ({
      sourceKey: observation.source.adapterKey,
      success: observation.success,
      errorMessage: observation.errorMessage,
      capturedAt: observation.capturedAt,
    }))),
    documents: ipo.documents.map((d) => ({
      label: d.label,
      url: d.url,
      docType: d.docType,
      evidenceLabel: filingEvidenceLabel(d.url),
      sourceHost: filingSourceHost(d.url),
    })),
    // Only immutable, human-approved FinancialPublished records reach the
    // public contract. Legacy scraped snapshots stay internal even when an
    // old boolean says "verified"; they do not carry sufficient provenance.
    financials: [...publishedByYear.values()],
    provenance: {
      discovery,
      gmp: [...gmpSourceLinks.values()],
      subscription: latestSub ? {
        name: latestSub.sourceName ?? "Subscription source",
        url: latestSub.sourceUrl ?? "https://www.nseindia.com/market-data/all-upcoming-issues-ipo",
        note: `Demand snapshot captured ${latestSub.capturedAt}`,
      } : null,
      officialFields: officialProvenance?.fields ?? [],
      sourceChecks: officialProvenance?.sourceChecks ?? [],
      applicationFacts: officialProvenance?.applicationFacts ?? [],
      officialDocuments: officialProvenance?.officialDocuments ?? [],
    },
  };
}

const COMPLETE_PUBLIC_FACTS = {
  priceBandLow: { not: null },
  priceBandHigh: { not: null },
  lotSize: { not: null },
  issueSizeCr: { not: null },
  openDate: { not: null },
  closeDate: { not: null },
  allotmentDate: { not: null },
  refundDate: { not: null },
  listingDate: { not: null },
  registrar: { not: null },
} as const;

function migrationCompatibilityError(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return code === "P2021" || code === "P2022";
}

function emptyOfficialProvenance(): OfficialProvenance {
  return {
    summaries: [],
    fields: [],
    sourceChecks: [],
    applicationFacts: [],
    officialDocuments: [],
    demand: null,
    matchedFields: 0,
    providers: [],
  };
}

async function loadOfficialOperations(ipoIds: string[]): Promise<Map<string, OfficialOperations>> {
  const result = new Map<string, OfficialOperations>();
  if (!ipoIds.length) return result;
  try {
    const rows = await prisma.ipo.findMany({
      where: { id: { in: ipoIds } },
      select: { id: true, officialLastAttemptAt: true, officialNextAttemptAt: true },
    });
    for (const row of rows) result.set(row.id, row);
  } catch (error) {
    if (!migrationCompatibilityError(error)) throw error;
  }
  return result;
}

async function loadOfficialProvenance(ipoIds: string[]): Promise<Map<string, OfficialProvenance>> {
  const result = new Map<string, OfficialProvenance>();
  if (!ipoIds.length) return result;
  let captures: Array<{
    ipoId: string;
    source: string;
    sourceUrl: string;
    capturedAt: Date;
    enrichment: unknown;
    comparisons: Array<{ field: string; status: "MATCH" | "CONFLICT" | "MISSING_OFFICIAL"; officialValue: string | null; sourceUrl: string | null }>;
  }> = [];
  try {
    captures = await prisma.officialEvidenceCapture.findMany({
      where: { ipoId: { in: ipoIds } },
      orderBy: { capturedAt: "desc" },
      select: {
        ipoId: true,
        source: true,
        sourceUrl: true,
        capturedAt: true,
        enrichment: true,
        comparisons: { orderBy: { field: "asc" }, select: { field: true, status: true, officialValue: true, sourceUrl: true } },
      },
    });
  } catch (error) {
    if (!migrationCompatibilityError(error)) throw error;
    try {
      const legacy = await prisma.officialEvidenceCapture.findMany({
        where: { ipoId: { in: ipoIds } },
        orderBy: { capturedAt: "desc" },
        select: {
          ipoId: true,
          source: true,
          sourceUrl: true,
          capturedAt: true,
          comparisons: { orderBy: { field: "asc" }, select: { field: true, status: true, officialValue: true, sourceUrl: true } },
        },
      });
      captures = legacy.map((capture) => ({ ...capture, enrichment: null }));
    } catch (legacyError) {
      if (!migrationCompatibilityError(legacyError)) throw legacyError;
    }
  }

  const seenCaptureSource = new Set<string>();
  const matchedByIpo = new Map<string, Set<string>>();
  for (const capture of captures) {
    const sourceKey = `${capture.ipoId}:${capture.source}`;
    if (seenCaptureSource.has(sourceKey)) continue;
    seenCaptureSource.add(sourceKey);
    const entry = result.get(capture.ipoId) ?? emptyOfficialProvenance();
    entry.providers.push(capture.source);
    entry.summaries.push({
      name: `${capture.source} official issue details`,
      url: capture.sourceUrl,
      note: capture.comparisons.length
        ? `${capture.comparisons.filter((comparison) => comparison.status === "MATCH").length}/${MATERIAL_OFFICIAL_FIELDS.length} core fields matched`
        : `Checked ${capture.capturedAt.toISOString()}`,
    });
    entry.fields.push(...capture.comparisons.map((comparison) => ({
      field: comparison.field,
      value: evidenceValue(comparison.officialValue),
      source: capture.source,
      url: comparison.sourceUrl ?? capture.sourceUrl,
      checkedAt: capture.capturedAt.toISOString(),
      status: comparison.status,
    })));
    const matched = matchedByIpo.get(capture.ipoId) ?? new Set<string>();
    for (const comparison of capture.comparisons) if (comparison.status === "MATCH") matched.add(comparison.field);
    matchedByIpo.set(capture.ipoId, matched);
    const projection = enrichmentProjection(capture.enrichment, capture.source, capture.sourceUrl);
    for (const fact of projection.facts) if (!entry.applicationFacts.some((existing) => existing.label === fact.label)) entry.applicationFacts.push(fact);
    for (const document of projection.documents) if (!entry.officialDocuments.some((existing) => existing.url === document.url)) entry.officialDocuments.push(document);
    if (projection.demand && (!entry.demand || new Date(projection.demand.capturedAt) > new Date(entry.demand.capturedAt))) entry.demand = projection.demand;
    result.set(capture.ipoId, entry);
  }

  try {
    const attempts = await prisma.officialSourceAttempt.findMany({
      where: { ipoId: { in: ipoIds } },
      orderBy: { attemptedAt: "desc" },
      select: { ipoId: true, source: true, status: true, reason: true, issueType: true, sourceUrl: true, attemptedAt: true },
    });
    const seenAttemptSource = new Set<string>();
    for (const attempt of attempts) {
      const sourceKey = `${attempt.ipoId}:${attempt.source}`;
      if (seenAttemptSource.has(sourceKey)) continue;
      seenAttemptSource.add(sourceKey);
      const entry = result.get(attempt.ipoId) ?? emptyOfficialProvenance();
      if (!entry.providers.includes(attempt.source)) entry.providers.push(attempt.source);
      entry.sourceChecks.push({
        source: attempt.source,
        status: attempt.status,
        reason: attempt.reason,
        issueType: attempt.issueType,
        url: attempt.sourceUrl,
        checkedAt: attempt.attemptedAt.toISOString(),
      });
      result.set(attempt.ipoId, entry);
    }
  } catch (error) {
    if (!migrationCompatibilityError(error)) throw error;
  }

  for (const [ipoId, entry] of result) {
    entry.providers = [...new Set(entry.providers)].sort();
    entry.matchedFields = matchedByIpo.get(ipoId)?.size ?? 0;
  }
  return result;
}

async function getIposByPublicationState(states: ("PUBLISHED" | "DRAFT" | "QUARANTINED")[]): Promise<BoardIpo[]> {
  const ipos = await prisma.ipo.findMany({
    where: { publicationState: { in: states }, ...COMPLETE_PUBLIC_FACTS },
    select: IPO_SELECT,
    orderBy: { createdAt: "asc" },
  });
  const ids = ipos.map((ipo) => ipo.id);
  const [provenanceByIpo, operationsByIpo] = await Promise.all([loadOfficialProvenance(ids), loadOfficialOperations(ids)]);
  return ipos.map((ipo) => shapeIpo(ipo, provenanceByIpo.get(ipo.id), operationsByIpo.get(ipo.id)));
}

export async function getPublicIpos(): Promise<BoardIpo[]> {
  return getIposByPublicationState(["PUBLISHED", "DRAFT", "QUARANTINED"]);
}

export async function getIndexableIpos(): Promise<BoardIpo[]> {
  return getIposByPublicationState(["PUBLISHED"]);
}

/** @deprecated Prefer the explicit public or indexable query. */
export async function getBoardIpos(): Promise<BoardIpo[]> {
  return getPublicIpos();
}

// No dedicated slug column exists yet — company count is small enough
// that computing the slug for every IPO and matching is simpler than a
// migration.
export async function getBoardIpoBySlug(slug: string): Promise<BoardIpo | null> {
  const ipos = await getPublicIpos();
  return ipos.find((ipo) => ipo.slug === slug) ?? null;
}

export async function getWatchlistIpos(userId: string): Promise<BoardIpo[]> {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    include: { ipo: { select: IPO_SELECT } },
    orderBy: { createdAt: "desc" },
  });
  const ids = items.map((item) => item.ipo.id);
  const [provenanceByIpo, operationsByIpo] = await Promise.all([loadOfficialProvenance(ids), loadOfficialOperations(ids)]);
  return items.map((item) => shapeIpo(item.ipo, provenanceByIpo.get(item.ipo.id), operationsByIpo.get(item.ipo.id)));
}
