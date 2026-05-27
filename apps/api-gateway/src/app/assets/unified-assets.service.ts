import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { Prisma, type AssetType } from '@prisma/client';

import { UnifiedAssetObject } from './unified-asset.dto';

export interface UnifiedAssetsListOptions {
  kinds?: AssetType[] | null;
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
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
 * Pagination defaults: `limit=100` (clamped to [1, 500]), `offset=0` (clamped
 * to >= 0). Non-finite or non-integer limit/offset values fall back to the
 * defaults (see `clampPagination`). Sort order is `lastSeenAt DESC, id ASC`
 * for deterministic paging.
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

    return this.prisma.$queryRaw<UnifiedAssetObject[]>`
      SELECT id, "engagementId", kind, "canonicalValue", "displayName",
             "firstSeenAt", "lastSeenAt", "riskScore", attrs
      FROM asset_unified_view
      WHERE "engagementId" = ${engagementId}
        ${kindsClause}
        ${searchClause}
      ORDER BY "lastSeenAt" DESC, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
}
