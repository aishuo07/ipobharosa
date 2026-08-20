-- CreateTable
CREATE TABLE "IpoComment" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpoComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IpoComment_ipoId_createdAt_idx" ON "IpoComment"("ipoId", "createdAt");

-- CreateIndex
CREATE INDEX "IpoComment_userId_idx" ON "IpoComment"("userId");

-- AddForeignKey
ALTER TABLE "IpoComment" ADD CONSTRAINT "IpoComment_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpoComment" ADD CONSTRAINT "IpoComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
