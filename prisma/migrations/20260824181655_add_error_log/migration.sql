CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "level" TEXT NOT NULL DEFAULT 'error',
    "message" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT '',
    "details" TEXT,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
CREATE INDEX "ErrorLog_route_idx" ON "ErrorLog"("route");
CREATE INDEX "ErrorLog_level_idx" ON "ErrorLog"("level");
