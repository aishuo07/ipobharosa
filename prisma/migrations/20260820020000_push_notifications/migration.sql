-- Push notification system: device tokens, allotment-launch dedup, and
-- broadcast history. All additive — no existing tables are modified.

CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX "PushDevice_disabled_lastSeenAt_idx" ON "PushDevice"("disabled", "lastSeenAt");

CREATE TABLE "AllotmentAnnouncement" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "registrar" TEXT,
    "announcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllotmentAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AllotmentAnnouncement_ipoId_key" ON "AllotmentAnnouncement"("ipoId");

CREATE TABLE "PushBroadcast" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "broadcastDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushBroadcast_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushBroadcast_kind_broadcastDate_key" ON "PushBroadcast"("kind", "broadcastDate");
CREATE INDEX "PushBroadcast_createdAt_idx" ON "PushBroadcast"("createdAt");