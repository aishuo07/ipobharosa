-- Additive multi-source evidence fields. Existing consumers can continue to
-- read OfficialEvidenceCapture without using the new JSON projections.
ALTER TABLE "Ipo" ADD COLUMN "officialIssueType" TEXT;

ALTER TABLE "OfficialEvidenceCapture"
ADD COLUMN "normalized" JSONB,
ADD COLUMN "enrichment" JSONB;

CREATE TABLE "OfficialSourceAttempt" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "issueType" TEXT,
    "sourceUrl" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialSourceAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfficialSourceAttempt_ipoId_attemptedAt_idx" ON "OfficialSourceAttempt"("ipoId", "attemptedAt");
CREATE INDEX "OfficialSourceAttempt_source_status_attemptedAt_idx" ON "OfficialSourceAttempt"("source", "status", "attemptedAt");

ALTER TABLE "OfficialSourceAttempt" ADD CONSTRAINT "OfficialSourceAttempt_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
