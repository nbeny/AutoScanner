import { UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Query, Resolver } from '@nestjs/graphql';
import { Queue } from 'bullmq';

import { QueueName } from '@autoscanner/queues';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QueueHealthObject } from './dto/queue-health.object';

@Resolver()
@UseGuards(JwtAuthGuard)
export class QueueHealthResolver {
  private readonly queues: Array<{ name: string; queue: Queue }>;

  constructor(
    @InjectQueue(QueueName.SCAN_JOBS) scanJobs: Queue,
    @InjectQueue(QueueName.PARSE_JOBS) parseJobs: Queue,
    @InjectQueue(QueueName.TEMPLATE_RUNS) templateRuns: Queue,
    @InjectQueue(QueueName.AI_RUNS) aiRuns: Queue,
    @InjectQueue(QueueName.CVE_ENRICHMENT) cveEnrichment: Queue,
  ) {
    this.queues = [
      { name: QueueName.SCAN_JOBS, queue: scanJobs },
      { name: QueueName.PARSE_JOBS, queue: parseJobs },
      { name: QueueName.TEMPLATE_RUNS, queue: templateRuns },
      { name: QueueName.AI_RUNS, queue: aiRuns },
      { name: QueueName.CVE_ENRICHMENT, queue: cveEnrichment },
    ];
  }

  @Query(() => [QueueHealthObject], { name: 'queueHealth' })
  async queueHealth(): Promise<QueueHealthObject[]> {
    return Promise.all(
      this.queues.map(async ({ name, queue }) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );
        let workers = 0;
        try {
          workers = (await queue.getWorkers()).length;
        } catch {
          workers = 0;
        }
        return {
          name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
          workers,
        };
      }),
    );
  }
}
