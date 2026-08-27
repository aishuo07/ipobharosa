CREATE TYPE "OfficialVerificationDecision" AS ENUM ('AUTO_PUBLISH', 'RETRY', 'EXCEPTION');
CREATE TYPE "OfficialFieldStatus" AS ENUM ('MATCH', 'CONFLICT', 'MISSING_OFFICIAL');

CREATE TABLE "OfficialEvidenceCapture" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "decision" "OfficialVerificationDecision" NOT NULL,
    "reasons" TEXT[],
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficialEvidenceCapture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficialFieldComparison" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "status" "OfficialFieldStatus" NOT NULL,
    "candidateValue" TEXT,
    "officialValue" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficialFieldComparison_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfficialEvidenceCapture_ipoId_capturedAt_idx" ON "OfficialEvidenceCapture"("ipoId", "capturedAt");
CREATE INDEX "OfficialEvidenceCapture_decision_capturedAt_idx" ON "OfficialEvidenceCapture"("decision", "capturedAt");
CREATE INDEX "OfficialFieldComparison_captureId_field_idx" ON "OfficialFieldComparison"("captureId", "field");

ALTER TABLE "OfficialEvidenceCapture" ADD CONSTRAINT "OfficialEvidenceCapture_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfficialFieldComparison" ADD CONSTRAINT "OfficialFieldComparison_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "OfficialEvidenceCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
