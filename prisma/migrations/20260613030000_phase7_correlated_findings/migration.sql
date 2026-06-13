-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'TRIAGED', 'CONFIRMED', 'FALSE_POSITIVE', 'RESOLVED');

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "correlatedFindingId" TEXT,
ADD COLUMN     "structuralHash" TEXT;

-- CreateTable
CREATE TABLE "CorrelatedFinding" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "structuralHash" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "cveId" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorrelatedFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorrelatedFinding_assetId_structuralHash_key" ON "CorrelatedFinding"("assetId", "structuralHash");

-- CreateIndex
CREATE INDEX "CorrelatedFinding_engagementId_idx" ON "CorrelatedFinding"("engagementId");

-- CreateIndex
CREATE INDEX "CorrelatedFinding_assetId_idx" ON "CorrelatedFinding"("assetId");

-- CreateIndex
CREATE INDEX "CorrelatedFinding_severity_idx" ON "CorrelatedFinding"("severity");

-- CreateIndex
CREATE INDEX "CorrelatedFinding_status_idx" ON "CorrelatedFinding"("status");

-- CreateIndex
CREATE INDEX "Finding_correlatedFindingId_idx" ON "Finding"("correlatedFindingId");

-- AddForeignKey
ALTER TABLE "CorrelatedFinding" ADD CONSTRAINT "CorrelatedFinding_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrelatedFinding" ADD CONSTRAINT "CorrelatedFinding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_correlatedFindingId_fkey" FOREIGN KEY ("correlatedFindingId") REFERENCES "CorrelatedFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
