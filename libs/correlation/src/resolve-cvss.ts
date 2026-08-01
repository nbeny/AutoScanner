import type { Prisma, PrismaClient } from '@prisma/client';

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Single source of truth for a CVE's CVSS v3 score.
 *
 * Before SP2b, risk scoring read `CveCache` while the triage list read `NvdCve` — the same
 * CVE could show two different numbers (SP2 defect 3). Both now call this helper, which reads
 * one precedence: the authoritative NVD mirror first, the on-demand enrichment cache as a
 * fallback for CVEs the bulk sync hasn't covered yet. A row present but with a null score is
 * treated as "no score here" so the fallback still gets a chance.
 */
export async function resolveCvssScores(
  prisma: PrismaLike,
  cveIds: readonly string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const ids = [...new Set(cveIds)];
  if (ids.length === 0) return out;

  const nvd = await prisma.nvdCve.findMany({
    where: { cveId: { in: ids } },
    select: { cveId: true, cvssV3Score: true },
  });
  for (const row of nvd) {
    if (row.cvssV3Score !== null) out.set(row.cveId, row.cvssV3Score);
  }

  const missing = ids.filter((id) => !out.has(id));
  if (missing.length > 0) {
    const cache = await prisma.cveCache.findMany({
      where: { cveId: { in: missing } },
      select: { cveId: true, cvssV3Score: true },
    });
    for (const row of cache) out.set(row.cveId, row.cvssV3Score ?? null);
  }
  return out;
}
