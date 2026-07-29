-- Breach intel theme (Task 1) — INTELX/LEAKIX providers + BreachExposure entity.
-- NOTE: authored by hand (no reachable Postgres in this environment to run
-- `prisma migrate dev`); apply is deferred to the operator via
-- `pnpm prisma migrate deploy` once `pnpm dev:up` is running.

-- AlterEnum
ALTER TYPE "ApiProvider" ADD VALUE IF NOT EXISTS 'INTELX';
ALTER TYPE "ApiProvider" ADD VALUE IF NOT EXISTS 'LEAKIX';

-- CreateTable
CREATE TABLE "BreachExposure" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "emailId" TEXT,
    "identityId" TEXT,
    "seed" TEXT NOT NULL,
    "breachName" TEXT NOT NULL,
    "breachDate" TIMESTAMP(3),
    "dataClasses" TEXT[],
    "passwordExposed" BOOLEAN NOT NULL DEFAULT false,
    "severity" "Severity" NOT NULL,
    "source" TEXT NOT NULL,
    "raw" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreachExposure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BreachExposure_engagementId_seed_breachName_source_key" ON "BreachExposure"("engagementId", "seed", "breachName", "source");

-- CreateIndex
CREATE INDEX "BreachExposure_engagementId_idx" ON "BreachExposure"("engagementId");

-- CreateIndex
CREATE INDEX "BreachExposure_emailId_idx" ON "BreachExposure"("emailId");

-- CreateIndex
CREATE INDEX "BreachExposure_identityId_idx" ON "BreachExposure"("identityId");

-- AddForeignKey
ALTER TABLE "BreachExposure" ADD CONSTRAINT "BreachExposure_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreachExposure" ADD CONSTRAINT "BreachExposure_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "Email"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreachExposure" ADD CONSTRAINT "BreachExposure_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
