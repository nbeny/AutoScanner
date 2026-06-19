-- AlterTable
ALTER TABLE "CorrelatedFinding" ADD COLUMN     "note" TEXT,
ADD COLUMN     "remediation" TEXT;

-- AlterTable
ALTER TABLE "TlsCertificate" ALTER COLUMN "subjectAn" DROP DEFAULT;

-- CreateTable
CREATE TABLE "FindingStatusEvent" (
    "id" TEXT NOT NULL,
    "correlatedFindingId" TEXT NOT NULL,
    "fromStatus" "FindingStatus" NOT NULL,
    "toStatus" "FindingStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FindingStatusEvent_correlatedFindingId_idx" ON "FindingStatusEvent"("correlatedFindingId");

-- AddForeignKey
ALTER TABLE "FindingStatusEvent" ADD CONSTRAINT "FindingStatusEvent_correlatedFindingId_fkey" FOREIGN KEY ("correlatedFindingId") REFERENCES "CorrelatedFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingStatusEvent" ADD CONSTRAINT "FindingStatusEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
