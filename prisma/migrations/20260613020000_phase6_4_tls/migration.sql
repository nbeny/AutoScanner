-- CreateTable
CREATE TABLE "TlsCertificate" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "subdomainId" TEXT,
    "host" TEXT NOT NULL,
    "subjectCn" TEXT,
    "subjectAn" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "issuerCn" TEXT,
    "notBefore" TIMESTAMP(3),
    "notAfter" TIMESTAMP(3),
    "fingerprintSha256" TEXT NOT NULL,
    "tlsVersion" TEXT,
    "selfSigned" BOOLEAN NOT NULL DEFAULT false,
    "expired" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TlsCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TlsCertificate_engagementId_fingerprintSha256_host_key" ON "TlsCertificate"("engagementId", "fingerprintSha256", "host");

-- CreateIndex
CREATE INDEX "TlsCertificate_engagementId_idx" ON "TlsCertificate"("engagementId");

-- CreateIndex
CREATE INDEX "TlsCertificate_subdomainId_idx" ON "TlsCertificate"("subdomainId");

-- AddForeignKey
ALTER TABLE "TlsCertificate" ADD CONSTRAINT "TlsCertificate_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TlsCertificate" ADD CONSTRAINT "TlsCertificate_subdomainId_fkey" FOREIGN KEY ("subdomainId") REFERENCES "Subdomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
