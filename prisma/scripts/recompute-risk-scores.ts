import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { PrismaClient } from '@prisma/client';
import { computeAssetRiskScore } from '@autoscanner/correlation';

const BATCH = 200;

async function main(): Promise<void> {
  const engagementId = process.argv[2] ?? null;
  const prisma = new PrismaClient();

  // eslint-disable-next-line no-console
  console.log(
    `[recompute] starting${engagementId ? ` for engagement ${engagementId}` : ' for ALL engagements'}`,
  );

  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    const rows = await prisma.asset.findMany({
      where: { deletedAt: null, ...(engagementId ? { engagementId } : {}) },
      select: { id: true },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      // Offline maintenance script — an explicit, documented exception to the "risk-engine is
      // the only Asset.riskScore writer" rule (SP2b). It may need to run with risk-engine down,
      // so it computes with the shared helper and writes the column directly.
      const score = await computeAssetRiskScore(prisma, row.id);
      await prisma.asset.update({ where: { id: row.id }, data: { riskScore: score } });
      processed++;
    }
    cursor = rows[rows.length - 1]!.id;
    // eslint-disable-next-line no-console
    console.log(`[recompute] processed ${processed}`);
  }

  // eslint-disable-next-line no-console
  console.log(`[recompute] done, ${processed} assets updated`);
  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
