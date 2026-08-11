-- CreateEnum
CREATE TYPE "IpoStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED', 'LISTED');

-- CreateEnum
CREATE TYPE "IpoBoard" AS ENUM ('MAINBOARD', 'SME');

-- CreateEnum
CREATE TYPE "ConfidenceTier" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "AlertTrigger" AS ENUM ('OPEN', 'CLOSING', 'ALLOTMENT', 'LISTING');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ipo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "IpoStatus" NOT NULL,
    "board" "IpoBoard" NOT NULL,
    "priceBandLow" DECIMAL(65,30),
    "priceBandHigh" DECIMAL(65,30),
    "lotSize" INTEGER,
    "issueSizeCr" DECIMAL(65,30),
    "freshIssueCr" DECIMAL(65,30),
    "ofsCr" DECIMAL(65,30),
    "openDate" TIMESTAMP(3),
    "closeDate" TIMESTAMP(3),
    "allotmentDate" TIMESTAMP(3),
    "refundDate" TIMESTAMP(3),
    "listingDate" TIMESTAMP(3),
    "listingPrice" DECIMAL(65,30),
    "registrar" TEXT,
    "leadManagers" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "docType" TEXT NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmpSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmpSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmpObservation" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "value" DECIMAL(65,30),
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmpObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmpSnapshot" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "medianValue" DECIMAL(65,30) NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "maxDeviation" DECIMAL(65,30) NOT NULL,
    "confidence" "ConfidenceTier" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmpSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceHealth" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "degraded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SourceHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionSnapshot" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "qibX" DECIMAL(65,30),
    "niiX" DECIMAL(65,30),
    "retailX" DECIMAL(65,30),
    "employeeX" DECIMAL(65,30),
    "sourceExchange" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSnapshot" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "revenueCr" DECIMAL(65,30),
    "patCr" DECIMAL(65,30),
    "peRatio" DECIMAL(65,30),
    "ronwPct" DECIMAL(65,30),
    "debtEquity" DECIMAL(65,30),
    "eps" DECIMAL(65,30),
    "enteredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL DEFAULT 'EMAIL',
    "trigger" "AlertTrigger" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ipo_status_idx" ON "Ipo"("status");

-- CreateIndex
CREATE INDEX "Document_ipoId_idx" ON "Document"("ipoId");

-- CreateIndex
CREATE UNIQUE INDEX "GmpSource_name_key" ON "GmpSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GmpSource_adapterKey_key" ON "GmpSource"("adapterKey");

-- CreateIndex
CREATE INDEX "GmpObservation_ipoId_capturedAt_idx" ON "GmpObservation"("ipoId", "capturedAt");

-- CreateIndex
CREATE INDEX "GmpObservation_sourceId_capturedAt_idx" ON "GmpObservation"("sourceId", "capturedAt");

-- CreateIndex
CREATE INDEX "GmpSnapshot_ipoId_capturedAt_idx" ON "GmpSnapshot"("ipoId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceHealth_sourceId_key" ON "SourceHealth"("sourceId");

-- CreateIndex
CREATE INDEX "SubscriptionSnapshot_ipoId_capturedAt_idx" ON "SubscriptionSnapshot"("ipoId", "capturedAt");

-- CreateIndex
CREATE INDEX "FinancialSnapshot_ipoId_idx" ON "FinancialSnapshot"("ipoId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_ipoId_key" ON "WatchlistItem"("userId", "ipoId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertSubscription_userId_ipoId_trigger_key" ON "AlertSubscription"("userId", "ipoId", "trigger");

-- AddForeignKey
ALTER TABLE "Ipo" ADD CONSTRAINT "Ipo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmpObservation" ADD CONSTRAINT "GmpObservation_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmpObservation" ADD CONSTRAINT "GmpObservation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GmpSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmpSnapshot" ADD CONSTRAINT "GmpSnapshot_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceHealth" ADD CONSTRAINT "SourceHealth_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "GmpSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionSnapshot" ADD CONSTRAINT "SubscriptionSnapshot_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSnapshot" ADD CONSTRAINT "FinancialSnapshot_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertSubscription" ADD CONSTRAINT "AlertSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertSubscription" ADD CONSTRAINT "AlertSubscription_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
