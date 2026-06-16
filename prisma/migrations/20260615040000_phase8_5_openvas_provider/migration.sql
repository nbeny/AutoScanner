-- Add OPENVAS to the ApiProvider enum (phase 8.5 openvasd credential).
ALTER TYPE "ApiProvider" ADD VALUE IF NOT EXISTS 'OPENVAS';
