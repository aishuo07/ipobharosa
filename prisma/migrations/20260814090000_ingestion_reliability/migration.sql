-- CreateEnum
CREATE TYPE "OfficialIncidentKind" AS ENUM ('CONFLICT', 'PUBLISHED_DRIFT');

-- CreateEnum
CREATE TYPE "OfficialIncidentStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Ipo"
ADD COLUMN "officialCheckAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "officialNextAttemptAt" TIMESTAMP(3),
ADD COLUMN "officialLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "officialLastSuccessAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OfficialEvidenceIncident" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" "OfficialIncidentKind" NOT NULL,
    "status" "OfficialIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL,
    "fields" TEXT[] NOT NULL,
    "reasons" TEXT[] NOT NULL,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialEvidenceIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceOperationHealth" (
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceOperationHealth_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DigestDelivery" (
    "id" TEXT NOT NULL,
    "digestDate" TIMESTAMP(3) NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ipo_publicationState_officialNextAttemptAt_idx" ON "Ipo"("publicationState", "officialNextAttemptAt");
CREATE INDEX "Ipo_officialLastSuccessAt_idx" ON "Ipo"("officialLastSuccessAt");
CREATE UNIQUE INDEX "OfficialEvidenceIncident_fingerprint_key" ON "OfficialEvidenceIncident"("fingerprint");
CREATE INDEX "OfficialEvidenceIncident_status_kind_lastSeenAt_idx" ON "OfficialEvidenceIncident"("status", "kind", "lastSeenAt");
CREATE INDEX "OfficialEvidenceIncident_ipoId_status_idx" ON "OfficialEvidenceIncident"("ipoId", "status");
CREATE INDEX "SourceOperationHealth_source_operation_idx" ON "SourceOperationHealth"("source", "operation");
CREATE INDEX "SourceOperationHealth_nextRetryAt_idx" ON "SourceOperationHealth"("nextRetryAt");
CREATE UNIQUE INDEX "DigestDelivery_digestDate_recipient_key" ON "DigestDelivery"("digestDate", "recipient");
CREATE INDEX "DigestDelivery_status_digestDate_idx" ON "DigestDelivery"("status", "digestDate");

-- AddForeignKey
ALTER TABLE "OfficialEvidenceIncident" ADD CONSTRAINT "OfficialEvidenceIncident_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
