import { ForbiddenException, Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { Prisma, type AssetType } from '@prisma/client';

import { UnifiedAssetObject } from './unified-asset.dto';
import { AssetDetailObject } from './dto/asset-detail.object';
import { AssetFacetsObject } from './dto/asset-facets.object';
import { AssetFilters } from './dto/asset-filters.input';
import { AssetSort } from './dto/asset-sort.enum';

export interface UnifiedAssetsListOptions {
  kinds?: AssetType[] | null;
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
  filters?: AssetFilters | null;
  sort?: AssetSort | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Clamps and normalizes user-supplied pagination inputs. Defends against
 * `NaN`, `Infinity`, and non-integer floats: any non-finite value falls back
 * to the default; finite floats are truncated to integers before clamping.
 * Postgres would reject `LIMIT NaN`, and silently accepting `12.7` as 12.7
 * is unfriendly — so we coerce here, not at the SQL layer.
 */
function clampPagination(
  limit: number | null | undefined,
  offset: number | null | undefined,
): { limit: number; offset: number } {
  const rawLimit = Number.isFinite(limit) ? Math.trunc(limit as number) : DEFAULT_LIMIT;
  const rawOffset = Number.isFinite(offset) ? Math.trunc(offset as number) : 0;
  return {
    limit: Math.min(Math.max(rawLimit, 1), MAX_LIMIT),
    offset: Math.max(rawOffset, 0),
  };
}

/**
 * Reads the `asset_unified_view` SQL view (introduced in
 * `20260528000000_asset_unified_view`) and projects a single row stream over
 * the polymorphic Asset side-tables. The frontend `unifiedAssets` query
 * targets this service for paginated listing across kinds.
 *
 * Filters:
 *   - `kinds`:  optional `AssetType[]`; an empty array is treated as "no filter".
 *   - `search`: case-insensitive substring on `canonicalValue` OR `displayName`.
 *               Trimmed; empty / whitespace-only is "no filter".
 *   - `filters.severityHas`: keeps assets with at least one Finding of that severity.
 *   - `filters.portRanges`: keeps assets with at least one OPEN port in any range.
 *   - `filters.techNames`: keeps assets with at least one matching Technology name.
 *   - `filters.scannerSources`: keeps assets touched by at least one of those scanners.
 * Pagination defaults: `limit=100` (clamped to [1, 500]), `offset=0` (clamped
 * to >= 0). Non-finite or non-integer limit/offset values fall back to the
 * defaults (see `clampPagination`). Default sort is `riskScore DESC, id ASC`.
 * Other AssetSort values dispatch to `firstSeenAt DESC`, `lastSeenAt DESC`, or
 * `canonicalValue ASC`.
 */
@Injectable()
export class UnifiedAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    engagementId: string,
    opts: UnifiedAssetsListOptions,
  ): Promise<UnifiedAssetObject[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    const { limit, offset } = clampPagination(opts.limit, opts.offset);

    const trimmed = opts.search?.trim();
    const search = trimmed && trimmed.length > 0 ? trimmed : null;
    const kinds = opts.kinds && opts.kinds.length > 0 ? opts.kinds : null;

    const kindsClause = kinds ? Prisma.sql`AND kind = ANY(${kinds}::"AssetType"[])` : Prisma.empty;

    const searchClause = search
      ? Prisma.sql`AND ("canonicalValue" ILIKE ${`%${search}%`} OR "displayName" ILIKE ${`%${search}%`})`
      : Prisma.empty;

    const filters = opts.filters ?? null;

    const severityClause =
      filters?.severityHas && filters.severityHas.length > 0
        ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Finding" f
        WHERE f."assetId" = asset_unified_view.id
          AND f."severity"::text = ANY(${filters.severityHas.map(String)}::text[])
      )`
        : Prisma.empty;

    const portClause =
      filters?.portRanges && filters.portRanges.length > 0
        ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Port" p
        WHERE p."assetId" = asset_unified_view.id
          AND p."state" = 'OPEN'
          AND (${Prisma.join(
            filters.portRanges.map((r) => Prisma.sql`(p."number" BETWEEN ${r.from} AND ${r.to})`),
            ' OR ',
          )})
      )`
        : Prisma.empty;

    const techClause =
      filters?.techNames && filters.techNames.length > 0
        ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Technology" t
        WHERE t."assetId" = asset_unified_view.id
          AND lower(t."name") = ANY(${filters.techNames.map((n) => n.toLowerCase())}::text[])
      )`
        : Prisma.empty;

    const scannerClause =
      filters?.scannerSources && filters.scannerSources.length > 0
        ? Prisma.sql`AND (
        EXISTS (
          SELECT 1 FROM "Finding" f
          JOIN "ScanJob" j ON j.id = f."scanJobId"
          WHERE f."assetId" = asset_unified_view.id
            AND j."scannerName" = ANY(${filters.scannerSources}::text[])
        )
        OR EXISTS (
          SELECT 1 FROM "Technology" t
          WHERE t."assetId" = asset_unified_view.id
            AND t."source" = ANY(${filters.scannerSources}::text[])
        )
      )`
        : Prisma.empty;

    const sort = opts.sort ?? AssetSort.RISK_SCORE;
    const orderBy =
      sort === AssetSort.RISK_SCORE
        ? Prisma.sql`ORDER BY "riskScore" DESC, id ASC`
        : sort === AssetSort.FIRST_SEEN_AT
          ? Prisma.sql`ORDER BY "firstSeenAt" DESC, id ASC`
          : sort === AssetSort.LAST_SEEN_AT
            ? Prisma.sql`ORDER BY "lastSeenAt" DESC, id ASC`
            : Prisma.sql`ORDER BY "canonicalValue" ASC, id ASC`;

    return this.prisma.$queryRaw<UnifiedAssetObject[]>(
      Prisma.sql`
      SELECT id, "engagementId", kind, "canonicalValue", "displayName",
             "firstSeenAt", "lastSeenAt", "riskScore", attrs
      FROM asset_unified_view
      WHERE "engagementId" = ${engagementId}
        ${kindsClause}
        ${searchClause}
        ${severityClause}
        ${portClause}
        ${techClause}
        ${scannerClause}
      ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `,
    );
  }

  async facets(
    userId: string,
    engagementId: string,
    _filters: AssetFilters | null,
  ): Promise<AssetFacetsObject> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    const [kindRows, sevRows, techRows, scanners] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['type'],
        where: { engagementId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.finding.groupBy({
        by: ['severity'],
        where: { asset: { engagementId, deletedAt: null } },
        _count: { _all: true },
      }),
      this.prisma.technology.groupBy({
        by: ['name'],
        where: { asset: { engagementId, deletedAt: null } },
        _count: { _all: true },
        orderBy: { _count: { name: 'desc' } },
        take: 20,
      }),
      this.prisma.scanJob.findMany({
        where: { scan: { engagementId } },
        select: { scannerName: true },
        distinct: ['scannerName'],
      }),
    ]);

    return {
      kindCounts: kindRows.map((r) => ({ kind: r.type, count: r._count._all })),
      severityCounts: sevRows.map((r) => ({ severity: r.severity, count: r._count._all })),
      topTechs: techRows.map((r) => ({ name: r.name, count: r._count._all })),
      scannerSources: scanners.map((s) => s.scannerName),
    };
  }

  async detail(userId: string, assetId: string): Promise<AssetDetailObject> {
    const a = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null },
      include: {
        engagement: { select: { ownerId: true } },
        ports: { include: { services: true } },
        findings: true,
        technologies: true,
        subdomain: { include: { dnsRecords: true, ips: { include: { ip: true } } } },
        domain: { include: { dnsRecords: true } },
        ipAddress: { include: { subdomains: { include: { subdomain: true } } } },
      },
    });
    if (!a) throw new NotFoundError('Asset', assetId);
    if (a.engagement.ownerId !== userId) {
      throw new ForbiddenException('Forbidden: asset belongs to another user');
    }

    const scanners = await this.prisma.scanJob.findMany({
      where: { findings: { some: { assetId } } },
      select: { scannerName: true },
      distinct: ['scannerName'],
    });

    const ports = a.ports.map((p) => ({
      id: p.id,
      number: p.number,
      protocol: p.protocol,
      state: p.state,
      lastSeenAt: p.lastSeenAt,
    }));
    const services = a.ports.flatMap((p) =>
      p.services.map((s) => ({
        id: s.id,
        name: s.name,
        product: s.product,
        version: s.version,
      })),
    );
    const dnsRecords = (a.subdomain?.dnsRecords ?? a.domain?.dnsRecords ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      value: r.value,
    }));

    return {
      id: a.id,
      kind: a.type,
      canonicalValue: a.canonicalValue,
      riskScore: a.riskScore,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
      ports,
      services,
      technologies: a.technologies.map((t) => ({
        id: t.id,
        name: t.name,
        version: t.version,
        source: t.source,
      })),
      dnsRecords,
      findings: a.findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        location: f.location,
        cveId: f.cveId,
        templateId: f.templateId,
        firstSeenAt: f.firstSeenAt,
        lastSeenAt: f.lastSeenAt,
      })),
      ipAddresses: a.subdomain?.ips.map((j) => j.ip.canonicalValue) ?? [],
      subdomains: a.ipAddress?.subdomains.map((j) => j.subdomain.canonicalValue) ?? [],
      observations: [],
      scannerSources: scanners.map((s) => s.scannerName),
    };
  }
}
