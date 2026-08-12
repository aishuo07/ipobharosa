CREATE TABLE "DiscoveryAttempt" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscoveryAttempt_sourceUrl_key" ON "DiscoveryAttempt"("sourceUrl");
CREATE INDEX "DiscoveryAttempt_nextAttemptAt_attempts_idx" ON "DiscoveryAttempt"("nextAttemptAt", "attempts");
