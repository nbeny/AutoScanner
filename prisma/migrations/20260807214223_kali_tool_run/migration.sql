-- CreateEnum
CREATE TYPE "KaliToolRunStatus" AS ENUM ('PENDING', 'RUNNING', 'PARSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "KaliToolRun" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "binary" TEXT NOT NULL,
    "argsJson" JSONB NOT NULL,
    "target" TEXT,
    "jsonRequested" BOOLEAN NOT NULL DEFAULT false,
    "status" "KaliToolRunStatus" NOT NULL DEFAULT 'PENDING',
    "rawOutputRef" TEXT,
    "outputFormat" TEXT,
    "exitCode" INTEGER,
    "parsedJson" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KaliToolRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KaliToolRun_engagementId_idx" ON "KaliToolRun"("engagementId");

-- AddForeignKey
ALTER TABLE "KaliToolRun" ADD CONSTRAINT "KaliToolRun_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KaliToolRun" ADD CONSTRAINT "KaliToolRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ComplianceMapping_engagementId_findingId_framework_controlId_ke" RENAME TO "ComplianceMapping_engagementId_findingId_framework_controlI_key";
