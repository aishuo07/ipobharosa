-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "FinancialDocumentType" AS ENUM ('DRHP', 'RHP', 'PROSPECTUS', 'CORRIGENDUM', 'ADDENDUM');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('EXTRACTED', 'NORMALIZED', 'VALIDATION_PASSED', 'VALIDATION_FAILED', 'OCR_FALLBACK');

-- CreateEnum
CREATE TYPE "FinancialRevisionState" AS ENUM ('EXTRACTED', 'NORMALIZED', 'VALIDATED', 'AUTO_VERIFIED', 'REVIEW_REQUIRED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "FinancialMetric" AS ENUM ('REVENUE', 'PAT', 'EPS', 'EBITDA', 'ASSETS', 'NET_WORTH', 'BORROWINGS');

-- AlterTable
ALTER TABLE "Ipo" ADD COLUMN     "autoPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discoveredAt" TIMESTAMP(3),
ADD COLUMN     "discoveredFrom" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "drhpUrl" TEXT,
ADD COLUMN     "publicationState" "PublicationState" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "quarantineReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "rhpUrl" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "FinancialSnapshot" DROP COLUMN "enteredBy",
ADD COLUMN     "source" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT;

-- CreateTable
CREATE TABLE "FinancialDocument" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "documentType" "FinancialDocumentType" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceHost" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "sha256" TEXT NOT NULL,
    "pageCount" INTEGER,
    "ocrRequired" BOOLEAN NOT NULL DEFAULT false,
    "ocrModel" TEXT,
    "publicationDate" TIMESTAMP(3),
    "isLatestForType" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "metric" "FinancialMetric" NOT NULL,
    "originalLabel" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "normalizedValue" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "unit" TEXT NOT NULL DEFAULT 'Cr',
    "fiscalYear" TEXT NOT NULL,
    "fiscalYearStart" TIMESTAMP(3),
    "fiscalYearEnd" TIMESTAMP(3),
    "scope" TEXT NOT NULL DEFAULT 'Consolidated',
    "auditStatus" TEXT NOT NULL DEFAULT 'Audited',
    "pageNumber" INTEGER,
    "tableReference" TEXT,
    "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'EXTRACTED',
    "extractionConfidence" DOUBLE PRECISION NOT NULL,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "ocrConfidence" DOUBLE PRECISION,
    "validationIssues" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialRevision" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "state" "FinancialRevisionState" NOT NULL DEFAULT 'EXTRACTED',
    "existingValue" DECIMAL(65,30),
    "existingSource" TEXT,
    "mismatchPercent" DOUBLE PRECISION,
    "validationPass" BOOLEAN,
    "validationNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewDecision" TEXT,
    "reviewNotes" TEXT,
    "publishedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialPublished" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "metric" "FinancialMetric" NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "extractionDate" TIMESTAMP(3) NOT NULL,
    "verificationDate" TIMESTAMP(3) NOT NULL,
    "approvedBy" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "supersededBy" TEXT,
    "revokedReason" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialPublished_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectionLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "performedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "transition" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionLock" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "runningSince" TIMESTAMP(3),
    "startedBy" TEXT,

    CONSTRAINT "IngestionLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL,
    "skippedDueToLock" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialDocument_ipoId_documentType_idx" ON "FinancialDocument"("ipoId", "documentType");

-- CreateIndex
CREATE INDEX "FinancialDocument_sourceUrl_idx" ON "FinancialDocument"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDocument_sha256_key" ON "FinancialDocument"("sha256");

-- CreateIndex
CREATE INDEX "FinancialExtraction_documentId_metric_idx" ON "FinancialExtraction"("documentId", "metric");

-- CreateIndex
CREATE INDEX "FinancialExtraction_fiscalYear_idx" ON "FinancialExtraction"("fiscalYear");

-- CreateIndex
CREATE INDEX "FinancialRevision_state_extractionId_idx" ON "FinancialRevision"("state", "extractionId");

-- CreateIndex
CREATE INDEX "FinancialPublished_ipoId_metric_idx" ON "FinancialPublished"("ipoId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialPublished_ipoId_metric_fiscalYear_revisionNumber_key" ON "FinancialPublished"("ipoId", "metric", "fiscalYear", "revisionNumber");

-- CreateIndex
CREATE INDEX "CorrectionLog_entityType_entityId_idx" ON "CorrectionLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ReminderDelivery_status_idx" ON "ReminderDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDelivery_userId_ipoId_transition_key" ON "ReminderDelivery"("userId", "ipoId", "transition");

-- CreateIndex
CREATE INDEX "IngestionRun_startedAt_idx" ON "IngestionRun"("startedAt");

-- CreateIndex
CREATE INDEX "Ipo_publicationState_idx" ON "Ipo"("publicationState");

-- AddForeignKey
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialExtraction" ADD CONSTRAINT "FinancialExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FinancialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRevision" ADD CONSTRAINT "FinancialRevision_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "FinancialExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialRevision" ADD CONSTRAINT "FinancialRevision_publishedId_fkey" FOREIGN KEY ("publishedId") REFERENCES "FinancialPublished"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPublished" ADD CONSTRAINT "FinancialPublished_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
