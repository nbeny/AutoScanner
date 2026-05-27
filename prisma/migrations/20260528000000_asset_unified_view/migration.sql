-- View that joins Asset with its polymorphic side-tables (Domain / Subdomain /
-- IpAddress) into a single denormalized projection. Powers the `unifiedAssets`
-- GraphQL query so the frontend can list mixed asset kinds in one paginated
-- result set.
--
-- COLUMN POLICY (allowlist, NOT denylist):
--   The side-table projections below use explicit `jsonb_build_object(...)`
--   calls rather than `to_jsonb(d.*)`. This is deliberate — `to_jsonb(d.*)`
--   would serialize every column of the side-table, including any future
--   additions (notes, owner, internal keys, opaque scanner state, etc.),
--   which would silently leak through `attrs` to GraphQL clients.
--
--   When adding columns to Domain / Subdomain / IpAddress, deliberately decide
--   whether they should be exposed here. The `metadata` JSON columns are
--   intentionally OMITTED — they hold internal scanner payload and must not
--   be returned by the unified asset feed.
--
-- Notes:
-- * All Prisma columns are mixed-case and MUST be referenced with double quotes
--   to bypass Postgres' default lowercase folding.
-- * Soft-deleted Asset rows are excluded via the `deletedAt IS NULL` predicate.
-- * `jsonb_strip_nulls` keeps `attrs` compact: for a DOMAIN-kind asset, only
--   the `domain` key is present (subdomain/ipAddress are stripped as NULL).
-- * Each side-table key is wrapped in a `CASE WHEN id IS NULL` guard so the
--   LEFT JOIN producing all-NULL columns yields a JSON `null` (stripped by
--   `jsonb_strip_nulls`) rather than an object full of NULL fields.
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
    'domain',    CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',           d.id,
      'value',        d.value,
      'canonicalValue', d."canonicalValue",
      'engagementId', d."engagementId",
      'firstSeenAt',  d."firstSeenAt",
      'lastSeenAt',   d."lastSeenAt"
    ) END,
    'subdomain', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',           s.id,
      'value',        s.value,
      'canonicalValue', s."canonicalValue",
      'domainId',     s."domainId",
      'engagementId', s."engagementId",
      'httpStatus',   s."httpStatus",
      'httpTitle',    s."httpTitle",
      'httpServer',   s."httpServer",
      'firstSeenAt',  s."firstSeenAt",
      'lastSeenAt',   s."lastSeenAt"
    ) END,
    'ipAddress', CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',           i.id,
      'value',        i.value,
      'canonicalValue', i."canonicalValue",
      'version',      i."version",
      'engagementId', i."engagementId",
      'firstSeenAt',  i."firstSeenAt",
      'lastSeenAt',   i."lastSeenAt"
    ) END
  )) AS attrs
FROM "Asset" a
LEFT JOIN "Domain"    d ON a."domainId"    = d.id
LEFT JOIN "Subdomain" s ON a."subdomainId" = s.id
LEFT JOIN "IpAddress" i ON a."ipAddressId" = i.id
WHERE a."deletedAt" IS NULL;
