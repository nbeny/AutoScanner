import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '@autoscanner/database';
import { QueueName, type AiRunPayload } from '@autoscanner/queues';

/**
 * Consumer for the `ai-runs` queue — runs the agentic scan-decision loop:
 * build world state -> ask Claude which scanner next -> dispatch via
 * {@link import('@autoscanner/scan-dispatch').ScanDispatcher} -> repeat under
 * guardrails -> audit.
 *
 * PLACEHOLDER: Task 3.5 implements the real loop. For now the processor just
 * acknowledges receipt so the queue plumbing can be exercised end-to-end.
 */
@Processor(QueueName.AI_RUNS)
export class AiRunProcessor extends WorkerHost {
  private readonly logger = new Logger(AiRunProcessor.name);

  // `prisma` is wired now so the DI graph is complete; Task 3.5's real loop
  // reads/writes AiRun rows through it. Referenced in the placeholder below to
  // keep it a genuine (non-dead) dependency under `noUnusedLocals`.
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AiRunPayload>): Promise<void> {
    void this.prisma;
    this.logger.log(`AiRun ${job.data.aiRunId} received (loop not yet implemented)`);
  }
}
