-- Add ABUSEIPDB to the ApiProvider enum (credential support for AbuseIPDB API).
ALTER TYPE "ApiProvider" ADD VALUE IF NOT EXISTS 'ABUSEIPDB';
