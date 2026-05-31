-- CreateEnum
CREATE TYPE "CveFetchStatus" AS ENUM ('OK', 'NOT_FOUND', 'RATE_LIMITED', 'ERROR');

-- CreateTable
CREATE TABLE "CveCache" (
    "cveId" TEXT NOT NULL,
    "cvssV3Score" DOUBLE PRECISION,
    "cvssV3Vector" TEXT,
    "severity" "Severity",
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastModified" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fetchStatus" "CveFetchStatus" NOT NULL DEFAULT 'OK',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    CONSTRAINT "CveCache_pkey" PRIMARY KEY ("cveId")
);

-- CreateIndex
CREATE INDEX "CveCache_expiresAt_idx" ON "CveCache"("expiresAt");
CREATE INDEX "CveCache_fetchStatus_idx" ON "CveCache"("fetchStatus");
