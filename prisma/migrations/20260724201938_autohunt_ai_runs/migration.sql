-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('PENDING', 'DISCOVERING', 'RUNNING', 'AUDITING', 'COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED_CAP');

-- CreateEnum
CREATE TYPE "AiRunStrategy" AS ENUM ('SINGLE_HOST', 'RANGE_PER_HOST', 'RANGE_AGGREGATE');

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "aiRunId" TEXT,
ADD COLUMN     "aiRunNodeId" TEXT;

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "strategy" "AiRunStrategy" NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
    "guardrails" JSONB NOT NULL,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "currentDepth" INTEGER NOT NULL DEFAULT 0,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "auditText" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunNode" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "parentNodeId" TEXT,
    "scanId" TEXT,
    "scannerName" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "rationale" TEXT,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDecision" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "worldStateSnapshot" JSONB NOT NULL,
    "responseJson" JSONB NOT NULL,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRun_engagementId_idx" ON "AiRun"("engagementId");

-- CreateIndex
CREATE INDEX "AiRunNode_aiRunId_idx" ON "AiRunNode"("aiRunId");

-- CreateIndex
CREATE INDEX "AiDecision_aiRunId_idx" ON "AiDecision"("aiRunId");

-- CreateIndex
CREATE INDEX "Scan_aiRunId_idx" ON "Scan"("aiRunId");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunNode" ADD CONSTRAINT "AiRunNode_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunNode" ADD CONSTRAINT "AiRunNode_parentNodeId_fkey" FOREIGN KEY ("parentNodeId") REFERENCES "AiRunNode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "AiDecision" ADD CONSTRAINT "AiDecision_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
