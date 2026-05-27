-- CreateEnum
CREATE TYPE "IpVersion" AS ENUM ('IPV4', 'IPV6');

-- CreateEnum
CREATE TYPE "DnsRecordType" AS ENUM ('A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'PTR', 'SRV', 'CAA', 'SOA');

-- CreateEnum
CREATE TYPE "TemplateRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "domainId" TEXT,
ADD COLUMN     "subdomainId" TEXT,
ADD COLUMN     "ipAddressId" TEXT;

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "templateRunId" TEXT,
ADD COLUMN     "stepIndex" INTEGER;

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "canonicalValue" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subdomain" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "canonicalValue" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "httpTitle" TEXT,
    "httpServer" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "Subdomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpAddress" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "canonicalValue" TEXT NOT NULL,
    "version" "IpVersion" NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "IpAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubdomainIp" (
    "subdomainId" TEXT NOT NULL,
    "ipAddressId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubdomainIp_pkey" PRIMARY KEY ("subdomainId","ipAddressId")
);

-- CreateTable
CREATE TABLE "DnsRecord" (
    "id" TEXT NOT NULL,
    "domainId" TEXT,
    "subdomainId" TEXT,
    "type" "DnsRecordType" NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "ttl" INTEGER,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DnsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technology" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "source" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Technology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRun" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" "TemplateRunStatus" NOT NULL DEFAULT 'PENDING',
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_engagementId_canonicalValue_key" ON "Domain"("engagementId", "canonicalValue");

-- CreateIndex
CREATE INDEX "Domain_engagementId_idx" ON "Domain"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "Subdomain_engagementId_canonicalValue_key" ON "Subdomain"("engagementId", "canonicalValue");

-- CreateIndex
CREATE INDEX "Subdomain_engagementId_idx" ON "Subdomain"("engagementId");

-- CreateIndex
CREATE INDEX "Subdomain_domainId_idx" ON "Subdomain"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "IpAddress_engagementId_canonicalValue_key" ON "IpAddress"("engagementId", "canonicalValue");

-- CreateIndex
CREATE INDEX "IpAddress_engagementId_idx" ON "IpAddress"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "DnsRecord_domainId_subdomainId_type_name_value_key" ON "DnsRecord"("domainId", "subdomainId", "type", "name", "value");

-- CreateIndex
CREATE INDEX "DnsRecord_subdomainId_idx" ON "DnsRecord"("subdomainId");

-- CreateIndex
CREATE INDEX "DnsRecord_domainId_idx" ON "DnsRecord"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "Technology_assetId_name_version_key" ON "Technology"("assetId", "name", "version");

-- CreateIndex
CREATE INDEX "Technology_assetId_idx" ON "Technology"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ScanTemplate_name_key" ON "ScanTemplate"("name");

-- CreateIndex
CREATE INDEX "TemplateRun_engagementId_idx" ON "TemplateRun"("engagementId");

-- CreateIndex
CREATE INDEX "TemplateRun_status_idx" ON "TemplateRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_domainId_key" ON "Asset"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_subdomainId_key" ON "Asset"("subdomainId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_ipAddressId_key" ON "Asset"("ipAddressId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_subdomainId_fkey" FOREIGN KEY ("subdomainId") REFERENCES "Subdomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ipAddressId_fkey" FOREIGN KEY ("ipAddressId") REFERENCES "IpAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_templateRunId_fkey" FOREIGN KEY ("templateRunId") REFERENCES "TemplateRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subdomain" ADD CONSTRAINT "Subdomain_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subdomain" ADD CONSTRAINT "Subdomain_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpAddress" ADD CONSTRAINT "IpAddress_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubdomainIp" ADD CONSTRAINT "SubdomainIp_subdomainId_fkey" FOREIGN KEY ("subdomainId") REFERENCES "Subdomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubdomainIp" ADD CONSTRAINT "SubdomainIp_ipAddressId_fkey" FOREIGN KEY ("ipAddressId") REFERENCES "IpAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_subdomainId_fkey" FOREIGN KEY ("subdomainId") REFERENCES "Subdomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technology" ADD CONSTRAINT "Technology_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRun" ADD CONSTRAINT "TemplateRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScanTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRun" ADD CONSTRAINT "TemplateRun_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRun" ADD CONSTRAINT "TemplateRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraint: enforce polymorphic FK integrity on Asset.
-- Short-circuited when the row is soft-deleted so that hard-deletes of the
-- referenced Domain/Subdomain/IpAddress (which set the FK to NULL via
-- ON DELETE SET NULL) do not break subsequent UPDATEs (e.g. setting deletedAt).
ALTER TABLE "Asset" ADD CONSTRAINT asset_polymorphic_fk_check CHECK (
  "deletedAt" IS NOT NULL OR (
    (type = 'DOMAIN'     AND "domainId"    IS NOT NULL AND "subdomainId" IS NULL AND "ipAddressId" IS NULL) OR
    (type = 'SUBDOMAIN'  AND "subdomainId" IS NOT NULL AND "domainId"    IS NULL AND "ipAddressId" IS NULL) OR
    (type = 'IP_ADDRESS' AND "ipAddressId" IS NOT NULL AND "domainId"    IS NULL AND "subdomainId" IS NULL) OR
    (type NOT IN ('DOMAIN', 'SUBDOMAIN', 'IP_ADDRESS') AND "domainId" IS NULL AND "subdomainId" IS NULL AND "ipAddressId" IS NULL)
  )
);
