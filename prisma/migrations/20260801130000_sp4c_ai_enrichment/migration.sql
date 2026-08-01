-- SP4c — AI supervisor: per-finding enrichment + per-decision agent role.
-- NOTE: authored by hand (no reachable Postgres here); apply via
-- `pnpm prisma migrate deploy` once `pnpm dev:up` is running.

-- AlterTable
ALTER TABLE "AiRun" ADD COLUMN "analysisJson" JSONB;

-- AlterTable
ALTER TABLE "AiDecision" ADD COLUMN "agentRole" TEXT;
