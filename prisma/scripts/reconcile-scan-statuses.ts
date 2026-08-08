import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { PrismaClient, type ScanStatus } from '@prisma/client';

/**
 * One-off backfill for Scans whose status was never rolled up from their jobs.
 *
 * Before the scan-worker learned to reconcile the parent Scan status (see
 * `deriveScanStatus` in apps/scan-worker), a Scan was created QUEUED and never
 * moved — so every finished scan stayed stuck at QUEUED, clogging the cockpit's
 * active-scanners panel and never appearing under the Completed filter (making
 * its results unreachable). This script fixes the pre-existing rows; the worker
 * fix prevents new ones.
 *
 * Idempotent: only touches Scans that are still non-terminal AND whose derived
 * status differs from the stored one. Run repeatedly with no ill effect.
 *
 *   pnpm reconcile:scan-statuses            # all engagements
 *   pnpm reconcile:scan-statuses <engId>    # scope to one engagement
 */

const TERMINAL: ScanStatus[] = ['COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED'];
const TERMINAL_SET = new Set<string>(TERMINAL);

/** Mirror of apps/scan-worker/src/app/scan-job.processor.ts `deriveScanStatus`. */
function deriveScanStatus(jobStatuses: string[]): ScanStatus {
  if (jobStatuses.length === 0) return 'QUEUED';
  const allTerminal = jobStatuses.every((s) => TERMINAL_SET.has(s));
  if (allTerminal) {
    if (jobStatuses.includes('FAILED')) return 'FAILED';
    if (jobStatuses.includes('TIMEOUT')) return 'TIMEOUT';
    if (jobStatuses.includes('CANCELLED')) return 'CANCELLED';
    return 'COMPLETED';
  }
  const anyStarted = jobStatuses.some((s) => s === 'RUNNING' || TERMINAL_SET.has(s));
  return anyStarted ? 'RUNNING' : 'QUEUED';
}

async function main(): Promise<void> {
  const engagementId = process.argv[2] ?? null;
  const prisma = new PrismaClient();

  // eslint-disable-next-line no-console
  console.log(
    `[reconcile-scans] starting${engagementId ? ` for engagement ${engagementId}` : ' for ALL engagements'}`,
  );

  // Only non-terminal Scans can be wrong: a terminal Scan is already settled and
  // must not be clobbered (e.g. an operator's CANCELLED).
  const scans = await prisma.scan.findMany({
    where: {
      status: { notIn: TERMINAL },
      ...(engagementId ? { engagementId } : {}),
    },
    select: { id: true, status: true, jobs: { select: { status: true, completedAt: true } } },
  });

  let updated = 0;
  for (const scan of scans) {
    const derived = deriveScanStatus(scan.jobs.map((j) => j.status));
    if (derived === scan.status) continue;

    const data: { status: ScanStatus; completedAt?: Date } = { status: derived };
    if (TERMINAL_SET.has(derived)) {
      const times = scan.jobs.map((j) => j.completedAt?.getTime() ?? Date.now());
      data.completedAt = new Date(times.length ? Math.max(...times) : Date.now());
    }
    await prisma.scan.updateMany({
      where: { id: scan.id, status: { notIn: TERMINAL } },
      data,
    });
    updated++;
    // eslint-disable-next-line no-console
    console.log(`[reconcile-scans] ${scan.id}: ${scan.status} -> ${derived}`);
  }

  // eslint-disable-next-line no-console
  console.log(`[reconcile-scans] done, ${updated}/${scans.length} scan(s) updated`);
  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
