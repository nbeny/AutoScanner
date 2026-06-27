CREATE TABLE "UserCapability" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grantedBy" TEXT NOT NULL,
  CONSTRAINT "UserCapability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserCapability_userId_key_key" ON "UserCapability"("userId", "key");
CREATE INDEX "UserCapability_key_idx" ON "UserCapability"("key");

ALTER TABLE "UserCapability"
  ADD CONSTRAINT "UserCapability_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
