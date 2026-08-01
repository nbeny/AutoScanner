-- SP5 — Ticketing & integrations (Part 4 §13). Hand-authored (no reachable Postgres here);
-- apply via `pnpm prisma migrate deploy` once `pnpm dev:up` is running.

-- CreateEnum
CREATE TYPE "TicketProvider" AS ENUM ('JIRA', 'GITHUB', 'GITLAB', 'AZURE_DEVOPS');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'CREATED', 'FAILED');

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "TicketProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "configEncrypted" BYTEA NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "findingId" TEXT,
    "correlatedFindingId" TEXT,
    "credentialId" TEXT NOT NULL,
    "provider" "TicketProvider" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_userId_provider_key" ON "IntegrationCredential"("userId", "provider");
CREATE INDEX "IntegrationCredential_userId_idx" ON "IntegrationCredential"("userId");
CREATE INDEX "Ticket_engagementId_idx" ON "Ticket"("engagementId");
CREATE INDEX "Ticket_correlatedFindingId_idx" ON "Ticket"("correlatedFindingId");

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "IntegrationCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
