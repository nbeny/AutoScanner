-- AlterTable
ALTER TABLE "AiRun" ADD COLUMN     "chainName" TEXT;

-- AlterTable
ALTER TABLE "AiRunNode" ADD COLUMN     "skipReason" TEXT,
ADD COLUMN     "stepId" TEXT;
