-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "url" TEXT,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Identity_engagementId_kind_seed_service_key" ON "Identity"("engagementId", "kind", "seed", "service");

-- CreateIndex
CREATE INDEX "Identity_engagementId_idx" ON "Identity"("engagementId");

-- AddForeignKey
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
