-- CreateEnum
CREATE TYPE "ObservationKind" AS ENUM ('DISCOVERED','RESOLVED','PORT_OPEN','SERVICE_DETECTED','TECH_DETECTED','HTTP_PROBED','DNS_RECORD','FINDING_RAISED');

-- CreateTable
CREATE TABLE "AssetObservation" (
    "id"          TEXT NOT NULL,
    "assetId"     TEXT NOT NULL,
    "scanJobId"   TEXT NOT NULL,
    "scannerName" TEXT NOT NULL,
    "kind"        "ObservationKind" NOT NULL,
    "observedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload"     JSONB,
    CONSTRAINT "AssetObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetObservation_assetId_observedAt_idx" ON "AssetObservation" ("assetId","observedAt");
CREATE INDEX "AssetObservation_scanJobId_idx"          ON "AssetObservation" ("scanJobId");
CREATE INDEX "AssetObservation_kind_idx"               ON "AssetObservation" ("kind");
CREATE INDEX "AssetObservation_scannerName_idx"        ON "AssetObservation" ("scannerName");

-- AddForeignKey
ALTER TABLE "AssetObservation"
  ADD CONSTRAINT "AssetObservation_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetObservation"
  ADD CONSTRAINT "AssetObservation_scanJobId_fkey"
  FOREIGN KEY ("scanJobId") REFERENCES "ScanJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
