import { prisma } from "@/lib/prisma";
import { normalize, validate, compareToExisting } from "./extraction";
import type { RawExtraction } from "./extraction";
import { classifyFinancialCandidate } from "./verification-policy";

type FinancialDocumentType = "DRHP" | "RHP" | "PROSPECTUS" | "CORRIGENDUM" | "ADDENDUM";
type FinancialRevisionState =
  | "EXTRACTED"
  | "NORMALIZED"
  | "VALIDATED"
  | "AUTO_VERIFIED"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "PUBLISHED"
  | "SUPERSEDED"
  | "REVOKED";

/**
 * Production financial verification workflow:
 *
 * 1. Ingest official document (DRHP/RHP/Prospectus)
 * 2. Extract candidate metrics
 * 3. Normalize and validate each
 * 4. Compare against existing published values
 * 5. Route deterministic safe candidates to AUTO_VERIFIED
 * 6. Publish safe candidates atomically per filing; review only exceptions
 * 7. Create immutable FinancialPublished record
 *
 * Every transition is logged in CorrectionLog for audit.
 */

export async function syncDocument(
  ipoId: string,
  documentType: FinancialDocumentType,
  sourceUrl: string,
  sha256: string,
  pageCount: number | null,
) {
  // Idempotent: check if this exact document is already ingested
  const existing = await prisma.financialDocument.findUnique({
    where: { sha256 },
  });

  if (existing) {
    if (existing.ipoId !== ipoId) throw new Error("document checksum is already attached to another IPO");
    console.log(`[financials] Document ${sha256.slice(0, 8)} already ingested (IPO: ${existing.ipoId})`);
    return existing.id;
  }

  // Ingest a new immutable document version and retire the previous latest
  // pointer for the same filing type. This keeps an official mirror retry from
  // leaving the blocked source eligible forever.
  const [, doc] = await prisma.$transaction([
    prisma.financialDocument.updateMany({
      where: { ipoId, documentType, isLatestForType: true },
      data: { isLatestForType: false },
    }),
    prisma.financialDocument.create({
      data: {
        ipoId,
        documentType,
        sourceUrl,
        sourceHost: new URL(sourceUrl).hostname,
        fetchedAt: new Date(),
        sha256,
        pageCount,
        isLatestForType: true,
        // Fetch time is known. Publication date must come from filing metadata;
        // using "now" here would manufacture evidence, so leave it empty.
        publicationDate: null,
      },
    }),
  ]);

  await prisma.correctionLog.create({
    data: {
      entityType: "FinancialDocument",
      entityId: doc.id,
      action: "ingest",
      performedBy: "extraction-pipeline",
      note: `Ingested ${documentType} from ${doc.sourceHost}`,
    },
  });

  return doc.id;
}

export async function processExtractions(ipoId: string, documentId: string, raws: RawExtraction[]) {
  const doc = await prisma.financialDocument.findUniqueOrThrow({ where: { id: documentId } });
  if (doc.ipoId !== ipoId) throw new Error("document does not belong to the supplied IPO");
  const documentRank: Partial<Record<FinancialDocumentType, number>> = { DRHP: 1, RHP: 2, PROSPECTUS: 3 };
  const newerDocument = await prisma.financialDocument.findFirst({
    where: {
      ipoId,
      isLatestForType: true,
      documentType: { in: (Object.entries(documentRank).filter(([, rank]) => rank > (documentRank[doc.documentType] ?? Number.POSITIVE_INFINITY)).map(([type]) => type)) as FinancialDocumentType[] },
    },
    select: { id: true },
  });
  const duplicateValues = new Map<string, number[]>();
  for (const raw of raws) {
    const normalized = normalize(raw);
    const key = `${raw.metric}:${raw.fiscalYear}`;
    duplicateValues.set(key, [...(duplicateValues.get(key) ?? []), normalized.normalizedValue]);
  }
  const extractions = [];

  for (const raw of raws) {
    // Normalize and validate
    const normalized = normalize(raw);
    const validated = validate(normalized);

    // Get existing published value for comparison
    const existing = await prisma.financialPublished.findFirst({
      where: { ipoId, metric: raw.metric, fiscalYear: raw.fiscalYear },
      orderBy: { publishedAt: "desc" },
    });

    const { percent } = compareToExisting(
      validated.normalizedValue,
      existing ? Number(existing.value) : null,
    );

    const decision = classifyFinancialCandidate({
      sourceUrl: doc.sourceUrl,
      documentType: doc.documentType,
      isLatestEvidence: doc.isLatestForType && !newerDocument,
      extractionConfidence: raw.extractionConfidence,
      ocrUsed: raw.ocrUsed,
      validationPass: validated.validationPass,
      validationIssues: validated.validationIssues,
      fiscalYear: raw.fiscalYear,
      scope: raw.scope,
      auditStatus: raw.auditStatus,
      pageNumber: raw.pageNumber ?? null,
      tableReference: raw.tableReference ?? null,
      normalizedValue: validated.normalizedValue,
      mismatchPercent: percent,
      hasExistingPublished: Boolean(existing),
      duplicateValues: duplicateValues.get(`${raw.metric}:${raw.fiscalYear}`) ?? [validated.normalizedValue],
    });

    // Create extraction record
    const extraction = await prisma.financialExtraction.create({
      data: {
        documentId,
        metric: raw.metric,
        originalLabel: raw.originalLabel,
        rawValue: raw.rawValue,
        normalizedValue: validated.normalizedValue,
        currency: validated.currency,
        unit: validated.unit,
        fiscalYear: raw.fiscalYear,
        scope: raw.scope,
        auditStatus: raw.auditStatus,
        pageNumber: raw.pageNumber,
        tableReference: raw.tableReference,
        extractionStatus: validated.severity === "HIGH_CONFIDENCE" ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
        extractionConfidence: raw.extractionConfidence,
        ocrUsed: raw.ocrUsed,
        ocrConfidence: raw.ocrConfidence,
        validationIssues: validated.validationIssues,
      },
    });

    // AUTO_VERIFIED means eligible for an authenticated, atomic filing-level
    // publish. It never makes a public record by itself.
    const revisionState = decision.state;

    const revision = await prisma.financialRevision.create({
      data: {
        extractionId: extraction.id,
        state: revisionState as FinancialRevisionState,
        existingValue: existing?.value ?? null,
        existingSource: existing?.sourceDocument ?? null,
        mismatchPercent: percent,
        validationPass: validated.validationPass,
        validationNotes: decision.reasons.length > 0 ? decision.reasons.join("; ") : null,
      },
    });

    await prisma.correctionLog.create({
      data: {
        entityType: "FinancialRevision",
        entityId: revision.id,
        action: "create",
        performedBy: "extraction-pipeline",
        note: `Extracted ${raw.metric} from ${doc.documentType}: ${validated.normalizedValue} ${validated.unit} (state: ${revisionState})`,
      },
    });

    extractions.push({ extraction, revision });
  }

  return extractions;
}

type SafeBatchResult = {
  documentId: string;
  published: number;
  supersededDuplicates: number;
};

/**
 * Revalidates and publishes every safe candidate from one immutable filing in
 * one transaction. Any changed/unsafe evidence aborts the entire operation.
 */
export async function publishSafeDocumentBatch(documentId: string, approverEmail: string): Promise<SafeBatchResult> {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.financialDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: {
        extractions: {
          include: {
            revisions: { where: { state: "AUTO_VERIFIED" }, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    if (!doc.isLatestForType) throw new Error("Filing is no longer the latest document of its type");

    const primaryDocumentTypes: FinancialDocumentType[] = ["DRHP", "RHP", "PROSPECTUS"];
    if (!primaryDocumentTypes.includes(doc.documentType)) throw new Error("Only a DRHP, RHP or Prospectus can be batch-published");
    const documentRank: Partial<Record<FinancialDocumentType, number>> = { DRHP: 1, RHP: 2, PROSPECTUS: 3 };
    const newerPrimaryDocument = await tx.financialDocument.findFirst({
      where: {
        ipoId: doc.ipoId,
        isLatestForType: true,
        documentType: { in: primaryDocumentTypes.filter((type) => (documentRank[type] ?? 0) > (documentRank[doc.documentType] ?? Number.POSITIVE_INFINITY)) },
      },
      select: { id: true },
    });
    if (newerPrimaryDocument) throw new Error("A newer primary filing supersedes this document");

    const candidates = doc.extractions.flatMap((extraction) => extraction.revisions.slice(0, 1).map((revision) => ({ extraction, revision })));
    if (candidates.length === 0) throw new Error("No safe candidates are ready in this filing");

    const grouped = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const key = `${candidate.extraction.metric}:${candidate.extraction.fiscalYear}`;
      grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
    }

    for (const group of grouped.values()) {
      const duplicateNumbers = group.map(({ extraction }) => Number(extraction.normalizedValue));
      for (const { extraction, revision } of group) {
        const existing = await tx.financialPublished.findFirst({
          where: { ipoId: doc.ipoId, metric: extraction.metric, fiscalYear: extraction.fiscalYear, supersededBy: null, revokedReason: null },
          select: { id: true, value: true },
        });
        const mismatch = compareToExisting(Number(extraction.normalizedValue), existing ? Number(existing.value) : null);
        const decision = classifyFinancialCandidate({
          sourceUrl: doc.sourceUrl,
          documentType: doc.documentType,
          isLatestEvidence: true,
          extractionConfidence: extraction.extractionConfidence,
          ocrUsed: extraction.ocrUsed,
          validationPass: revision.validationPass === true,
          validationIssues: extraction.validationIssues,
          fiscalYear: extraction.fiscalYear,
          scope: extraction.scope,
          auditStatus: extraction.auditStatus,
          pageNumber: extraction.pageNumber,
          tableReference: extraction.tableReference,
          normalizedValue: extraction.normalizedValue === null ? null : Number(extraction.normalizedValue),
          mismatchPercent: mismatch.percent,
          hasExistingPublished: Boolean(existing),
          duplicateValues: duplicateNumbers,
        });
        if (decision.state !== "AUTO_VERIFIED") {
          throw new Error(`Safe batch changed for ${extraction.metric} ${extraction.fiscalYear}: ${decision.reasons.join(", ")}`);
        }
      }
    }

    let publishedCount = 0;
    let supersededDuplicates = 0;
    for (const group of grouped.values()) {
      const ordered = [...group].sort((a, b) => b.extraction.extractionConfidence - a.extraction.extractionConfidence || a.extraction.id.localeCompare(b.extraction.id));
      const [selected, ...duplicates] = ordered;
      const published = await tx.financialPublished.create({
        data: {
          ipoId: doc.ipoId,
          metric: selected.extraction.metric,
          value: selected.extraction.normalizedValue!,
          fiscalYear: selected.extraction.fiscalYear,
          sourceDocument: doc.documentType,
          sourceUrl: doc.sourceUrl,
          pageNumber: selected.extraction.pageNumber,
          extractionDate: selected.extraction.createdAt,
          verificationDate: new Date(),
          approvedBy: approverEmail,
        },
      });
      await tx.financialRevision.update({
        where: { id: selected.revision.id },
        data: { state: "PUBLISHED", reviewedBy: approverEmail, reviewedAt: new Date(), reviewDecision: "safe-batch-approved", publishedId: published.id },
      });
      await tx.correctionLog.create({
        data: {
          entityType: "FinancialRevision",
          entityId: selected.revision.id,
          action: "safe-batch-publish",
          performedBy: approverEmail,
          note: `Published ${selected.extraction.metric} for FY ${selected.extraction.fiscalYear} from filing ${doc.sha256}`,
        },
      });
      publishedCount++;

      for (const duplicate of duplicates) {
        await tx.financialRevision.update({
          where: { id: duplicate.revision.id },
          data: { state: "SUPERSEDED", reviewedBy: approverEmail, reviewedAt: new Date(), reviewDecision: "agreeing-duplicate", reviewNotes: `Canonical revision: ${selected.revision.id}` },
        });
        supersededDuplicates++;
      }
    }

    return { documentId, published: publishedCount, supersededDuplicates };
  });
}

export type FinancialClassificationRow = {
  revisionId: string;
  documentId: string;
  filing: string;
  company: string;
  metric: string;
  fiscalYear: string;
  previousState: "AUTO_VERIFIED" | "REVIEW_REQUIRED";
  previousNotes: string | null;
  state: "AUTO_VERIFIED" | "REVIEW_REQUIRED";
  reasons: string[];
};

/** Produces the exact queue reclassification without writing to the database. */
export async function previewPendingFinancialClassification(): Promise<FinancialClassificationRow[]> {
  const revisions = await prisma.financialRevision.findMany({
    where: { state: { in: ["AUTO_VERIFIED", "REVIEW_REQUIRED"] } },
    include: { extraction: { include: { document: { include: { ipo: { include: { company: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  const documents = await prisma.financialDocument.findMany({
    where: { ipoId: { in: [...new Set(revisions.map((revision) => revision.extraction.document.ipoId))] } },
    select: { ipoId: true, documentType: true, isLatestForType: true },
  });
  const documentRank: Record<string, number> = { DRHP: 1, RHP: 2, PROSPECTUS: 3 };
  const duplicateGroups = new Map<string, number[]>();
  for (const revision of revisions) {
    const extraction = revision.extraction;
    const key = `${extraction.documentId}:${extraction.metric}:${extraction.fiscalYear}`;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), Number(extraction.normalizedValue)]);
  }

  const rows: FinancialClassificationRow[] = [];
  for (const revision of revisions) {
    const extraction = revision.extraction;
    const doc = extraction.document;
    const newerDocument = documents.some((candidate) =>
      candidate.ipoId === doc.ipoId && candidate.isLatestForType && documentRank[candidate.documentType] !== undefined && documentRank[candidate.documentType] > (documentRank[doc.documentType] ?? Number.POSITIVE_INFINITY),
    );
    const existing = await prisma.financialPublished.findFirst({
      where: { ipoId: doc.ipoId, metric: extraction.metric, fiscalYear: extraction.fiscalYear, supersededBy: null, revokedReason: null },
      select: { value: true },
    });
    const normalizedValue = extraction.normalizedValue === null ? null : Number(extraction.normalizedValue);
    const mismatch = compareToExisting(normalizedValue ?? Number.NaN, existing ? Number(existing.value) : null);
    const key = `${extraction.documentId}:${extraction.metric}:${extraction.fiscalYear}`;
    const decision = classifyFinancialCandidate({
      sourceUrl: doc.sourceUrl,
      documentType: doc.documentType,
      isLatestEvidence: doc.isLatestForType && !newerDocument,
      extractionConfidence: extraction.extractionConfidence,
      ocrUsed: extraction.ocrUsed,
      validationPass: revision.validationPass === true,
      validationIssues: extraction.validationIssues,
      fiscalYear: extraction.fiscalYear,
      scope: extraction.scope,
      auditStatus: extraction.auditStatus,
      pageNumber: extraction.pageNumber,
      tableReference: extraction.tableReference,
      normalizedValue,
      mismatchPercent: mismatch.percent,
      hasExistingPublished: Boolean(existing),
      duplicateValues: duplicateGroups.get(key) ?? [],
    });
    rows.push({
      revisionId: revision.id,
      documentId: doc.id,
      filing: doc.documentType,
      company: doc.ipo.company.name,
      metric: extraction.metric,
      fiscalYear: extraction.fiscalYear,
      previousState: revision.state as "AUTO_VERIFIED" | "REVIEW_REQUIRED",
      previousNotes: revision.validationNotes,
      state: decision.state,
      reasons: decision.reasons,
    });
  }
  return rows;
}

/** Applies a previously previewable deterministic classification; publishes nothing. */
export async function applyPendingFinancialClassification(actorEmail: string) {
  const rows = await previewPendingFinancialClassification();
  const changed = rows.filter((row) => row.previousState !== row.state || row.previousNotes !== (row.reasons.join("; ") || null));
  if (changed.length > 0) await prisma.$transaction(changed.flatMap((row) => [
    prisma.financialRevision.update({
      where: { id: row.revisionId },
      data: { state: row.state, validationNotes: row.reasons.join("; ") || null },
    }),
    prisma.correctionLog.create({
      data: {
        entityType: "FinancialRevision",
        entityId: row.revisionId,
        action: "verification-policy-classification",
        performedBy: actorEmail,
        note: `${row.previousState} -> ${row.state}${row.reasons.length ? ` (${row.reasons.join(", ")})` : ""}`,
      },
    }),
  ]));
  return { total: rows.length, changed: changed.length, safe: rows.filter((row) => row.state === "AUTO_VERIFIED").length };
}

export async function approveRevision(revisionId: string, approverEmail: string) {
  const revision = await prisma.financialRevision.findUniqueOrThrow({ where: { id: revisionId } });

  if (revision.state === "PUBLISHED") {
    throw new Error("Cannot modify published revision");
  }

  const extraction = await prisma.financialExtraction.findUniqueOrThrow({
    where: { id: revision.extractionId },
  });
  const doc = await prisma.financialDocument.findUniqueOrThrow({
    where: { id: extraction.documentId },
  });

  // Create published record
  const published = await prisma.financialPublished.create({
    data: {
      ipoId: doc.ipoId,
      metric: extraction.metric,
      value: extraction.normalizedValue!,
      fiscalYear: extraction.fiscalYear,
      sourceDocument: doc.documentType,
      sourceUrl: doc.sourceUrl,
      pageNumber: extraction.pageNumber,
      extractionDate: extraction.createdAt,
      verificationDate: new Date(),
      approvedBy: approverEmail,
    },
  });

  // Update revision
  const updated = await prisma.financialRevision.update({
    where: { id: revisionId },
    data: {
      state: "PUBLISHED",
      reviewedBy: approverEmail,
      reviewedAt: new Date(),
      publishedId: published.id,
    },
  });

  await prisma.correctionLog.create({
    data: {
      entityType: "FinancialRevision",
      entityId: revisionId,
      action: "approve-and-publish",
      performedBy: approverEmail,
      note: `Published ${extraction.metric} for FY ${extraction.fiscalYear}: ${extraction.normalizedValue} ${extraction.unit}`,
    },
  });

  return { published, updated };
}

export async function rejectRevision(revisionId: string, rejecterEmail: string, reason: string) {
  const updated = await prisma.financialRevision.update({
    where: { id: revisionId },
    data: {
      state: "REVIEW_REQUIRED",
      reviewedBy: rejecterEmail,
      reviewedAt: new Date(),
      reviewDecision: "rejected",
      reviewNotes: reason,
    },
  });

  await prisma.correctionLog.create({
    data: {
      entityType: "FinancialRevision",
      entityId: revisionId,
      action: "reject",
      performedBy: rejecterEmail,
      note: reason,
    },
  });

  return updated;
}

/**
 * Get unresolved candidates for an IPO. AUTO_VERIFIED rows are ready for one
 * filing-level publish action; REVIEW_REQUIRED rows need exception review.
 */
export async function getPendingReviews(ipoId: string) {
  return await prisma.financialRevision.findMany({
    where: {
      extraction: { document: { ipoId } },
      state: { in: ["AUTO_VERIFIED", "REVIEW_REQUIRED"] },
    },
    include: {
      extraction: {
        include: { document: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get published financials for display.
 */
export async function getPublished(ipoId: string) {
  return await prisma.financialPublished.findMany({
    where: { ipoId, supersededBy: null, revokedReason: null },
    orderBy: { metric: "asc" },
  });
}
