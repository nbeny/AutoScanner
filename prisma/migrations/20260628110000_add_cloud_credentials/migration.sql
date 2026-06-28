-- Phase 14C-authed-infra — cloud credential tables.

CREATE TABLE "AwsCredential" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "accessKeyIdCipher" BYTEA NOT NULL,
  "secretAccessKeyCipher" BYTEA NOT NULL,
  "sessionTokenCipher" BYTEA,
  "region" TEXT,
  "callerArn" TEXT,
  "accountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AwsCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AwsCredential_ownerId_key" ON "AwsCredential"("ownerId");
ALTER TABLE "AwsCredential"
  ADD CONSTRAINT "AwsCredential_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AzureCredential" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "tenantIdCipher" BYTEA NOT NULL,
  "clientIdCipher" BYTEA NOT NULL,
  "clientSecretCipher" BYTEA NOT NULL,
  "subscriptionIdCipher" BYTEA,
  "subscriptionName" TEXT,
  "callerObjectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AzureCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AzureCredential_ownerId_key" ON "AzureCredential"("ownerId");
ALTER TABLE "AzureCredential"
  ADD CONSTRAINT "AzureCredential_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GcpCredential" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "serviceAccountJsonCipher" BYTEA NOT NULL,
  "projectId" TEXT,
  "serviceAccountEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GcpCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GcpCredential_ownerId_key" ON "GcpCredential"("ownerId");
ALTER TABLE "GcpCredential"
  ADD CONSTRAINT "GcpCredential_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
