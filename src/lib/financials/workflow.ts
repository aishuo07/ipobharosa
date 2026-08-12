import { prisma } from "@/lib/prisma";
import { normalize, validate, compareToExisting } from "./extraction";
import type { RawExtraction } from "./extraction";

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
 * 5. Route to AUTO_VERIFIED or REVIEW_REQUIRED
 * 6. Human approval gate before publish
 * 7. Create immutable FinancialPublished record
 *
 * Every transition is logged in CorrectionLog for audit.
 */

export async function syncDocument(ipoId: string, documentType: FinancialDocumentType, sourceUrl: string, sha256: string, pageCount: number) {
  // Idempotent: check if this exact document is already ingested
  const existing = await prisma.financialDocument.findUnique({
    where: { sha256 },
  });

  if (existing) {
    console.log(`[financials] Document ${sha256.slice(0, 8)} already ingested (IPO: ${existing.ipoId})`);
    return existing.id;
  }

  // Ingest new document
  const doc = await prisma.financialDocument.create({
    data: {
      ipoId,
      documentType,
      sourceUrl,
      sourceHost: new URL(sourceUrl).hostname,
      fetchedAt: new Date(),
      sha256,
      pageCount,
      publicationDate: new Date(),
    },
  });

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

    const { mismatch, percent } = compareToExisting(
      validated.normalizedValue,
      existing?.value ? Number(existing.value) : null,
    );

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

    // Create revision with initial state
    const revisionState = !mismatch && validated.severity === "HIGH_CONFIDENCE" ? "AUTO_VERIFIED" : "REVIEW_REQUIRED";

    const revision = await prisma.financialRevision.create({
      data: {
        extractionId: extraction.id,
        state: revisionState as FinancialRevisionState,
        existingValue: existing?.value ?? null,
        existingSource: existing?.sourceDocument ?? null,
        mismatchPercent: percent,
        validationPass: validated.validationPass,
        validationNotes: validated.validationIssues.length > 0 ? validated.validationIssues.join("; ") : null,
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
 * Get all pending reviews for an IPO (state = REVIEW_REQUIRED or AUTO_VERIFIED awaiting final sign-off).
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
