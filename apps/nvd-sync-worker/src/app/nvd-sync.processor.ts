import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { PrismaService } from '@autoscanner/database';
import { NvdClient, cvssToSeverity, type NvdFullCve } from '@autoscanner/cve';
import { QueueName, type NvdSyncPayload } from '@autoscanner/queues';

const PAGE = 2000;
const MAX_WINDOW_MS = 120 * 86_400_000;
const DEFAULT_INCREMENTAL_LOOKBACK_MS = 30 * 86_400_000;

@Processor(QueueName.NVD_SYNC)
@Injectable()
export class NvdSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(NvdSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nvd: NvdClient,
  ) {
    super();
  }

  private parseVendorProduct(criteria: string): { cpeVendor: string; cpeProduct: string } {
    const parts = criteria.split(':');
    return { cpeVendor: parts[3] ?? '*', cpeProduct: parts[4] ?? '*' };
  }

  private async upsertCve(cve: NvdFullCve): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.nvdConfigNode.deleteMany({ where: { cveId: cve.cveId } });
      await tx.nvdCve.upsert({
        where: { cveId: cve.cveId },
        create: {
          cveId: cve.cveId,
          cvssV3Score: cve.cvssV3Score,
          cvssV3Vector: cve.cvssV3Vector,
          severity: cvssToSeverity(cve.cvssV3Score),
          summary: cve.summary,
          publishedAt: cve.publishedAt,
          lastModified: cve.lastModified,
          syncedAt: new Date(),
        },
        update: {
          cvssV3Score: cve.cvssV3Score,
          cvssV3Vector: cve.cvssV3Vector,
          severity: cvssToSeverity(cve.cvssV3Score),
          summary: cve.summary,
          publishedAt: cve.publishedAt,
          lastModified: cve.lastModified,
          syncedAt: new Date(),
        },
      });
      for (const node of cve.nodes) {
        await tx.nvdConfigNode.create({
          data: {
            cveId: cve.cveId,
            operator: node.operator,
            negate: node.negate,
            matches: {
              create: node.cpeMatch.map((m) => ({
                criteria: m.criteria,
                vulnerable: m.vulnerable,
                ...this.parseVendorProduct(m.criteria),
                versionStartIncluding: m.versionStartIncluding ?? null,
                versionStartExcluding: m.versionStartExcluding ?? null,
                versionEndIncluding: m.versionEndIncluding ?? null,
                versionEndExcluding: m.versionEndExcluding ?? null,
              })),
            },
          },
        });
      }
    });
  }

  async process(job: Job<NvdSyncPayload>): Promise<void> {
    const state = await this.prisma.nvdSyncState.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });

    if (job.data.mode === 'full' || !state.fullSyncCompletedAt) {
      // Full sync (resumable)
      let startIndex = state.lastStartIndex ?? 0;
      let total = Infinity;

      this.logger.log(`Starting full sync from startIndex=${startIndex}`);

      while (startIndex < total) {
        const page = await this.nvd.fetchCvePage({ startIndex, resultsPerPage: PAGE });
        total = page.totalResults;

        if (page.cves.length === 0) break;

        for (const cve of page.cves) {
          await this.upsertCve(cve);
        }

        startIndex += page.cves.length;
        await this.prisma.nvdSyncState.update({
          where: { id: 'singleton' },
          data: { lastStartIndex: startIndex, totalCves: total },
        });

        this.logger.log(`Full sync progress: ${startIndex}/${total}`);
      }

      await this.prisma.nvdSyncState.update({
        where: { id: 'singleton' },
        data: {
          fullSyncCompletedAt: new Date(),
          lastFullSyncAt: new Date(),
          lastModEndDate: new Date(),
          lastStartIndex: 0,
        },
      });

      this.logger.log('Full sync completed');
    } else {
      // Incremental sync with windowed pagination
      const end = new Date();
      let winStart = state.lastModEndDate ?? new Date(Date.now() - DEFAULT_INCREMENTAL_LOOKBACK_MS);

      this.logger.log(
        `Starting incremental sync from ${winStart.toISOString()} to ${end.toISOString()}`,
      );

      while (winStart < end) {
        const winEndMs = Math.min(winStart.getTime() + MAX_WINDOW_MS, end.getTime());
        const winEnd = new Date(winEndMs);

        let startIndex = 0;
        let total = Infinity;

        while (startIndex < total) {
          const page = await this.nvd.fetchCvePage({
            startIndex,
            resultsPerPage: PAGE,
            lastModStartDate: winStart.toISOString(),
            lastModEndDate: winEnd.toISOString(),
          });
          total = page.totalResults;

          if (page.cves.length === 0) break;

          for (const cve of page.cves) {
            await this.upsertCve(cve);
          }

          startIndex += page.cves.length;
          this.logger.log(
            `Incremental window [${winStart.toISOString()}–${winEnd.toISOString()}]: ${startIndex}/${total}`,
          );
        }

        winStart = winEnd;
      }

      await this.prisma.nvdSyncState.update({
        where: { id: 'singleton' },
        data: { lastModEndDate: end },
      });

      this.logger.log('Incremental sync completed');
    }
  }
}
