-- SP2d — Threat Intelligence & Compliance greenfield services.
-- NOTE: authored by hand (no reachable Postgres in this environment to run
-- `prisma migrate dev`); apply is deferred to the operator via
-- `pnpm prisma migrate deploy` once `pnpm dev:up` is running.

-- CreateEnum
CREATE TYPE "ThreatIntelKind" AS ENUM ('IP_REPUTATION', 'EXPLOIT_AVAILABLE', 'ACTIVE_EXPLOITATION', 'KEV', 'LEAK');

-- CreateEnum
CREATE TYPE "ComplianceFramework" AS ENUM ('OWASP_TOP10', 'MITRE_ATTACK', 'CWE', 'CIS', 'ISO27001', 'PCI_DSS', 'GDPR', 'NIS2');

-- CreateTable
CREATE TABLE "ThreatIntel" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "findingId" TEXT,
    "cveId" TEXT,
    "indicator" TEXT NOT NULL,
    "kind" "ThreatIntelKind" NOT NULL,
    "source" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "payload" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreatIntel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceMapping" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "correlatedFindingId" TEXT,
    "findingId" TEXT,
    "framework" "ComplianceFramework" NOT NULL,
    "controlId" TEXT NOT NULL,
    "controlTitle" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThreatIntel_engagementId_indicator_source_kind_key" ON "ThreatIntel"("engagementId", "indicator", "source", "kind");

-- CreateIndex
CREATE INDEX "ThreatIntel_engagementId_idx" ON "ThreatIntel"("engagementId");

-- CreateIndex
CREATE INDEX "ThreatIntel_cveId_idx" ON "ThreatIntel"("cveId");

-- CreateIndex
CREATE INDEX "ThreatIntel_findingId_idx" ON "ThreatIntel"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceMapping_engagementId_findingId_framework_controlId_key" ON "ComplianceMapping"("engagementId", "findingId", "framework", "controlId");

-- CreateIndex
CREATE INDEX "ComplianceMapping_engagementId_idx" ON "ComplianceMapping"("engagementId");

-- CreateIndex
CREATE INDEX "ComplianceMapping_correlatedFindingId_idx" ON "ComplianceMapping"("correlatedFindingId");

-- CreateIndex
CREATE INDEX "ComplianceMapping_findingId_idx" ON "ComplianceMapping"("findingId");

-- AddForeignKey
ALTER TABLE "ThreatIntel" ADD CONSTRAINT "ThreatIntel_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceMapping" ADD CONSTRAINT "ComplianceMapping_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
