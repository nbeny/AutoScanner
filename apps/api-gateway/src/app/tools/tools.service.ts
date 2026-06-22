import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { SeverityCountsObject } from '../insight/dto/severity-counts.object';
import { ToolActivityObject } from './dto/tool-activity.object';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

@Injectable()
export class ToolsService {
  constructor(private readonly prisma: PrismaService) {}

  async toolActivity(
    userId: string,
    opts: { engagementId?: string },
  ): Promise<ToolActivityObject[]> {
    const { engagementId } = opts;

    if (engagementId) {
      const eng = await this.prisma.engagement.findFirst({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
      if (!eng) throw new NotFoundError('Engagement', engagementId);
    }

    const scanWhere = {
      scan: {
        engagement: {
          ownerId: userId,
          deletedAt: null,
          ...(engagementId ? { id: engagementId } : {}),
        },
      },
    };

    const jobs = await this.prisma.scanJob.findMany({
      where: scanWhere,
      select: { scannerName: true, status: true, durationMs: true, completedAt: true },
    });

    const findings = await this.prisma.finding.findMany({
      where: { scanJob: scanWhere },
      select: { severity: true, scanJob: { select: { scannerName: true } } },
    });

    // Aggregate per scannerName
    type Bucket = {
      totalExecutions: number;
      successCount: number;
      failureCount: number;
      durations: number[];
      lastRunAt: Date | null;
      totalFindings: number;
      severityCounts: SeverityCountsObject;
    };

    const buckets = new Map<string, Bucket>();

    const getBucket = (name: string): Bucket => {
      let b = buckets.get(name);
      if (!b) {
        b = {
          totalExecutions: 0,
          successCount: 0,
          failureCount: 0,
          durations: [],
          lastRunAt: null,
          totalFindings: 0,
          severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        };
        buckets.set(name, b);
      }
      return b;
    };

    for (const job of jobs) {
      const b = getBucket(job.scannerName);
      b.totalExecutions++;
      if (job.status === 'COMPLETED') b.successCount++;
      if (job.status === 'FAILED' || job.status === 'TIMEOUT') b.failureCount++;
      if (job.durationMs != null) b.durations.push(job.durationMs);
      if (job.completedAt != null) {
        if (b.lastRunAt === null || job.completedAt > b.lastRunAt) {
          b.lastRunAt = job.completedAt;
        }
      }
    }

    for (const finding of findings) {
      const name = finding.scanJob.scannerName;
      const b = getBucket(name);
      b.totalFindings++;
      const sev = finding.severity.toLowerCase() as keyof SeverityCountsObject;
      if (sev in b.severityCounts) {
        (b.severityCounts[sev] as number)++;
      }
    }

    const result: ToolActivityObject[] = [];
    for (const [scannerName, b] of buckets.entries()) {
      result.push({
        scannerName,
        totalExecutions: b.totalExecutions,
        successCount: b.successCount,
        failureCount: b.failureCount,
        medianDurationMs: median(b.durations),
        findingsBySeverity: b.severityCounts,
        lastRunAt: b.lastRunAt,
        totalFindings: b.totalFindings,
      });
    }

    return result;
  }
}
