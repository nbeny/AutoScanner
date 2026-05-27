-- View that joins Asset with its polymorphic side-tables (Domain / Subdomain /
-- IpAddress) into a single denormalized projection. Powers the `unifiedAssets`
-- GraphQL query so the frontend can list mixed asset kinds in one paginated
-- result set.
--
-- Notes:
-- * All Prisma columns are mixed-case and MUST be referenced with double quotes
--   to bypass Postgres' default lowercase folding.
-- * Soft-deleted Asset rows are excluded via the `deletedAt IS NULL` predicate.
-- * `attrs` is a JSONB object keyed by side-table name; jsonb_strip_nulls keeps
--   the payload compact for the type the row actually represents.
CREATE OR REPLACE VIEW asset_unified_view AS
SELECT
  a.id,
  a."engagementId" AS "engagementId",
  a."type" AS kind,
  a."canonicalValue" AS "canonicalValue",
  a."value" AS "displayName",
  a."firstSeenAt" AS "firstSeenAt",
  a."lastSeenAt" AS "lastSeenAt",
  a."riskScore" AS "riskScore",
  jsonb_strip_nulls(jsonb_build_object(
    'domain',    to_jsonb(d.*),
    'subdomain', to_jsonb(s.*),
    'ipAddress', to_jsonb(i.*)
  )) AS attrs
FROM "Asset" a
LEFT JOIN "Domain"    d ON a."domainId"    = d.id
LEFT JOIN "Subdomain" s ON a."subdomainId" = s.id
LEFT JOIN "IpAddress" i ON a."ipAddressId" = i.id
WHERE a."deletedAt" IS NULL;
