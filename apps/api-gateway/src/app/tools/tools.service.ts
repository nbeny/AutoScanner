import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { ToolActivityObject } from './dto/tool-activity.object';
import {
  ToolAgentStatObject,
  ToolDetailObject,
  ToolErrorObject,
  ToolRunObject,
} from './dto/tool-detail.object';

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

  private async assertOwnership(userId: string, engagementId: string): Promise<void> {
    const eng = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!eng) throw new NotFoundError('Engagement', engagementId);
  }

  async toolActivity(
    userId: string,
    opts: { engagementId?: string },
  ): Promise<ToolActivityObject[]> {
    const { engagementId } = opts;

    if (engagementId) {
      await this.assertOwnership(userId, engagementId);
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

    // Aggregate per scannerName. Findings/entities are no longer produced, so
    // tool activity is purely scan-execution based.
    type Bucket = {
      totalExecutions: number;
      successCount: number;
      failureCount: number;
      durations: number[];
      lastRunAt: Date | null;
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

    const result: ToolActivityObject[] = [];
    for (const [scannerName, b] of buckets.entries()) {
      result.push({
        scannerName,
        totalExecutions: b.totalExecutions,
        successCount: b.successCount,
        failureCount: b.failureCount,
        medianDurationMs: median(b.durations),
        lastRunAt: b.lastRunAt,
      });
    }

    return result;
  }

  async toolDetail(
    userId: string,
    opts: { engagementId?: string },
    scannerName: string,
    limit = 50,
  ): Promise<ToolDetailObject> {
    const { engagementId } = opts;

    if (engagementId) {
      await this.assertOwnership(userId, engagementId);
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

    const rawRuns = await this.prisma.scanJob.findMany({
      where: { ...scanWhere, scannerName },
      select: {
        id: true,
        status: true,
        durationMs: true,
        exitCode: true,
        errorMessage: true,
        completedAt: true,
        agentId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const runs: ToolRunObject[] = rawRuns.map((r) => ({
      scanJobId: r.id,
      status: r.status,
      durationMs: r.durationMs,
      exitCode: r.exitCode,
      errorMessage: r.errorMessage,
      completedAt: r.completedAt,
      agentId: r.agentId,
    }));

    // recurringErrors: group non-null errorMessage, sort by count desc
    const errorMap = new Map<string, number>();
    for (const r of rawRuns) {
      if (r.errorMessage != null) {
        errorMap.set(r.errorMessage, (errorMap.get(r.errorMessage) ?? 0) + 1);
      }
    }
    const recurringErrors: ToolErrorObject[] = [...errorMap.entries()]
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count);

    // agents: group non-null agentId
    type AgentBucket = { executions: number; successCount: number };
    const agentMap = new Map<string, AgentBucket>();
    for (const r of rawRuns) {
      if (r.agentId != null) {
        let bucket = agentMap.get(r.agentId);
        if (!bucket) {
          bucket = { executions: 0, successCount: 0 };
          agentMap.set(r.agentId, bucket);
        }
        bucket.executions++;
        if (r.status === 'COMPLETED') bucket.successCount++;
      }
    }
    const agents: ToolAgentStatObject[] = [...agentMap.entries()].map(([agentId, b]) => ({
      agentId,
      executions: b.executions,
      successCount: b.successCount,
    }));

    return { scannerName, runs, recurringErrors, agents };
  }
}
