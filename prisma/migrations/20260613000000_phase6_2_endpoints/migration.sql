-- CreateTable
CREATE TABLE "Endpoint" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "subdomainId" TEXT,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "statusCode" INTEGER,
    "contentLength" INTEGER,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "Endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Endpoint_engagementId_canonicalUrl_method_key" ON "Endpoint"("engagementId", "canonicalUrl", "method");

-- CreateIndex
CREATE INDEX "Endpoint_engagementId_idx" ON "Endpoint"("engagementId");

-- CreateIndex
CREATE INDEX "Endpoint_subdomainId_idx" ON "Endpoint"("subdomainId");

-- AddForeignKey
ALTER TABLE "Endpoint" ADD CONSTRAINT "Endpoint_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endpoint" ADD CONSTRAINT "Endpoint_subdomainId_fkey" FOREIGN KEY ("subdomainId") REFERENCES "Subdomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
