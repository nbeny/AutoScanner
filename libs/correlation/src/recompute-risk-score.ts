import type { Prisma, PrismaClient } from '@prisma/client';
import { computeRiskScore } from './risk-score';

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Recompute Asset.riskScore using the formula in `libs/correlation/risk-score.ts`.
 * Read-modify-write. Caller is expected to wrap this in the same transaction as
 * the persister upsert (see parser-worker for the retry-on-P2034 pattern).
 *
 * Throws if the asset id is unknown. Does not soft-delete-check (callers in
 * parser-worker are always operating on the asset they just upserted; the
 * backfill script filters `deletedAt = null` before iterating).
 */
export async function recomputeRiskScoreForAsset(
  prisma: PrismaLike,
  assetId: string,
): Promise<number> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      findings: { select: { severity: true, cveId: true } },
      ports: {
        select: {
          number: true,
          state: true,
          services: { select: { name: true, product: true } },
        },
      },
    },
  });
  if (!asset) throw new Error(`Asset not found: ${assetId}`);

  const score = computeRiskScore({
    findings: asset.findings,
    ports: asset.ports,
  });

  await prisma.asset.update({
    where: { id: assetId },
    data: { riskScore: score },
  });

  return score;
}
