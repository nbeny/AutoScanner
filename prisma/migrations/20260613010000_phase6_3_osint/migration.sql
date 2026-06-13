-- CreateEnum
CREATE TYPE "OrgMetadataKind" AS ENUM ('WHOIS', 'ASN', 'ORG', 'NETBLOCK', 'OTHER');

-- CreateEnum
CREATE TYPE "ApiProvider" AS ENUM ('SHODAN', 'CENSYS');

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMetadata" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "kind" "OrgMetadataKind" NOT NULL,
    "data" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" "ApiProvider" NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Email_engagementId_address_key" ON "Email"("engagementId", "address");

-- CreateIndex
CREATE INDEX "Email_engagementId_idx" ON "Email"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMetadata_engagementId_kind_source_key" ON "OrgMetadata"("engagementId", "kind", "source");

-- CreateIndex
CREATE INDEX "OrgMetadata_engagementId_idx" ON "OrgMetadata"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiCredential_ownerId_provider_key" ON "ApiCredential"("ownerId", "provider");

-- CreateIndex
CREATE INDEX "ApiCredential_ownerId_idx" ON "ApiCredential"("ownerId");

-- AddForeignKey
ALTER TABLE "Email" ADD CONSTRAINT "Email_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMetadata" ADD CONSTRAINT "OrgMetadata_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
