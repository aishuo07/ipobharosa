-- CreateEnum
CREATE TYPE "IpoFilingStage" AS ENUM ('DRHP_FILED', 'RHP_FILED');

-- CreateTable
CREATE TABLE "IpoFilingCatalogue" (
    "id" TEXT NOT NULL,
    "issuerKey" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "stage" "IpoFilingStage" NOT NULL,
    "filingDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "documentUrl" TEXT,
    "raw" JSONB NOT NULL,
    "ipoId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpoFilingCatalogue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IpoFilingCatalogue_sourceUrl_key" ON "IpoFilingCatalogue"("sourceUrl");
CREATE INDEX "IpoFilingCatalogue_issuerKey_filingDate_idx" ON "IpoFilingCatalogue"("issuerKey", "filingDate");
CREATE INDEX "IpoFilingCatalogue_stage_filingDate_idx" ON "IpoFilingCatalogue"("stage", "filingDate");
CREATE INDEX "IpoFilingCatalogue_ipoId_idx" ON "IpoFilingCatalogue"("ipoId");

-- AddForeignKey
ALTER TABLE "IpoFilingCatalogue" ADD CONSTRAINT "IpoFilingCatalogue_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
