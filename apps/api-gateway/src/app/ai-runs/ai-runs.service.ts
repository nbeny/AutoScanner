import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AiRun, AiRunNode, AiDecision } from '@prisma/client';

import { NotFoundError, ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { type AiRunPayload } from '@autoscanner/queues';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import { parseTarget } from '@autoscanner/target-parser';

import { RunAiScanInput } from './dto/run-ai-scan.input';
import { QuickScanProvisioner } from './quick-scan-provisioner.service';

const AI_RUN_TOPIC = 'security.ai.run.requested';

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED_CAP'];

@Injectable()
export class AiRunsService {
  private readonly logger = new Logger(AiRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    private readonly provisioner: QuickScanProvisioner,
  ) {}

  async runAiScan(userId: string, input: RunAiScanInput): Promise<AiRun> {
    const parsed = parseTarget(input.target);
    if (parsed.kind === 'invalid') {
      throw new ValidationError('Invalid target: expected an IPv4/IPv6 address, range, or CIDR.');
    }

    const eng = await this.provisioner.ensureEngagement(userId);
    await this.provisioner.grantAllCapabilities(userId);
    await this.provisioner.addTargetToScope(eng.id, input.target);

    const aiRun = await this.prisma.aiRun.create({
      data: {
        engagementId: eng.id,
        createdById: userId,
        target: input.target,
        strategy: parsed.strategy,
        status: 'PENDING',
        // The worker merges DEFAULT_GUARDRAILS over this; storing a partial or
        // empty object is correct.
        guardrails: (input.guardrails ?? {}) as Prisma.InputJsonValue,
      },
    });

    try {
      await this.bus.publish<AiRunPayload>(AI_RUN_TOPIC, aiRun.id, {
        aiRunId: aiRun.id,
        engagementId: eng.id,
      });
    } catch (err) {
      // The AiRun row is already committed; if the enqueue fails (Redis down,
      // queue rejected the job, etc.) reconcile it to FAILED so the UI never
      // shows a phantom PENDING run no worker will ever pick up. The original
      // enqueue error must surface intact.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to enqueue aiRun=${aiRun.id}: ${message}`);
      await this.prisma.aiRun
        .update({
          where: { id: aiRun.id },
          data: { status: 'FAILED', errorMessage: `enqueue failed: ${message}` },
        })
        .catch(() => undefined);
      throw err;
    }

    this.logger.log(`Enqueued aiRun=${aiRun.id} target=${input.target}`);
    return aiRun;
  }

  async getForOwner(userId: string, id: string): Promise<AiRun | null> {
    return this.prisma.aiRun.findFirst({
      where: { id, engagement: { ownerId: userId, deletedAt: null } },
    });
  }

  async listForOwner(userId: string, limit = 50): Promise<AiRun[]> {
    return this.prisma.aiRun.findMany({
      where: { engagement: { ownerId: userId, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async cancel(userId: string, id: string): Promise<AiRun> {
    const run = await this.prisma.aiRun.findFirst({
      where: { id, engagement: { ownerId: userId, deletedAt: null } },
    });
    if (!run) throw new NotFoundError('AiRun', id);

    if (TERMINAL_STATUSES.includes(run.status)) {
      return run;
    }

    return this.prisma.aiRun.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  nodesFor(aiRunId: string): Promise<AiRunNode[]> {
    return this.prisma.aiRunNode.findMany({
      where: { aiRunId },
      orderBy: { createdAt: 'asc' },
    });
  }

  decisionsFor(aiRunId: string): Promise<AiDecision[]> {
    return this.prisma.aiDecision.findMany({
      where: { aiRunId },
      orderBy: { round: 'asc' },
    });
  }
}
