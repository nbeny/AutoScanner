-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'IDLE', 'OFFLINE', 'REVOKED');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT,
    "publicKey" TEXT,
    "registrationToken" TEXT,
    "registrationExpiresAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3),
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "capabilities" JSONB,
    "version" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_name_key" ON "Agent"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_registrationToken_key" ON "Agent"("registrationToken");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "Agent_lastHeartbeatAt_idx" ON "Agent"("lastHeartbeatAt");

-- AlterTable
ALTER TABLE "ScanJob" ADD COLUMN "agentId" TEXT;

-- CreateIndex
CREATE INDEX "ScanJob_agentId_idx" ON "ScanJob"("agentId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanJob" ADD CONSTRAINT "ScanJob_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
