-- CreateTable
CREATE TABLE "EngagementAuthProfile" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementAuthProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngagementAuthProfile_engagementId_key" ON "EngagementAuthProfile"("engagementId");

-- CreateIndex
CREATE INDEX "EngagementAuthProfile_engagementId_idx" ON "EngagementAuthProfile"("engagementId");

-- AddForeignKey
ALTER TABLE "EngagementAuthProfile" ADD CONSTRAINT "EngagementAuthProfile_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
