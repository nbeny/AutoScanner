-- CreateEnum
CREATE TYPE "NvdConfigOperator" AS ENUM ('AND', 'OR');

-- CreateTable
CREATE TABLE "NvdCve" (
    "cveId" TEXT NOT NULL,
    "cvssV3Score" DOUBLE PRECISION,
    "cvssV3Vector" TEXT,
    "severity" "Severity",
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastModified" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NvdCve_pkey" PRIMARY KEY ("cveId")
);

-- CreateTable
CREATE TABLE "NvdConfigNode" (
    "id" TEXT NOT NULL,
    "cveId" TEXT NOT NULL,
    "operator" "NvdConfigOperator" NOT NULL,
    "negate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NvdConfigNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NvdCpeMatch" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "vulnerable" BOOLEAN NOT NULL,
    "cpeVendor" TEXT NOT NULL,
    "cpeProduct" TEXT NOT NULL,
    "versionStartIncluding" TEXT,
    "versionStartExcluding" TEXT,
    "versionEndIncluding" TEXT,
    "versionEndExcluding" TEXT,

    CONSTRAINT "NvdCpeMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NvdSyncState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastModEndDate" TIMESTAMP(3),
    "fullSyncCompletedAt" TIMESTAMP(3),
    "lastFullSyncAt" TIMESTAMP(3),
    "lastStartIndex" INTEGER NOT NULL DEFAULT 0,
    "totalCves" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NvdSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NvdCve_lastModified_idx" ON "NvdCve"("lastModified");

-- CreateIndex
CREATE INDEX "NvdConfigNode_cveId_idx" ON "NvdConfigNode"("cveId");

-- CreateIndex
CREATE INDEX "NvdCpeMatch_cpeVendor_cpeProduct_idx" ON "NvdCpeMatch"("cpeVendor", "cpeProduct");

-- CreateIndex
CREATE INDEX "NvdCpeMatch_nodeId_idx" ON "NvdCpeMatch"("nodeId");

-- AddForeignKey
ALTER TABLE "NvdConfigNode" ADD CONSTRAINT "NvdConfigNode_cveId_fkey" FOREIGN KEY ("cveId") REFERENCES "NvdCve"("cveId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NvdCpeMatch" ADD CONSTRAINT "NvdCpeMatch_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "NvdConfigNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
