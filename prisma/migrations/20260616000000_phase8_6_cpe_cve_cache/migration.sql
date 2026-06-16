-- CreateTable
CREATE TABLE "CpeCveCache" (
    "cpe" TEXT NOT NULL,
    "cveIds" TEXT[],
    "scores" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CpeCveCache_pkey" PRIMARY KEY ("cpe")
);

-- CreateIndex
CREATE INDEX "CpeCveCache_expiresAt_idx" ON "CpeCveCache"("expiresAt");
