import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AiRun } from '@prisma/client';

import { ValidationError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { type AiRunPayload } from '@autoscanner/queues';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import { ChainRegistry, CHAIN_REGISTRY, type ChainDefinition } from '@autoscanner/chains';

import { QuickScanProvisioner } from '../ai-runs/quick-scan-provisioner.service';
import type { RunChainInput } from './dto/run-chain.input';

const AI_RUN_TOPIC = 'security.ai.run.requested';

@Injectable()
export class ChainLauncher {
  private readonly logger = new Logger(ChainLauncher.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    private readonly provisioner: QuickScanProvisioner,
    @Inject(CHAIN_REGISTRY) private readonly registry: ChainRegistry,
  ) {}

  /** Point d'entrée unique (spec §7) — appelé par l'API, l'orchestration, l'IA. */
  async launch(userId: string, input: RunChainInput): Promise<AiRun> {
    if (!this.registry.has(input.chainName)) {
      throw new ValidationError(`Unknown chain: ${input.chainName}`);
    }
    const target = input.target.trim();
    if (target.length === 0) {
      throw new ValidationError('Chain target must be a non-empty host / domain / URL / IP.');
    }

    const eng = await this.provisioner.ensureEngagement(userId);
    await this.provisioner.grantAllCapabilities(userId);
    await this.provisioner.addTargetToScope(eng.id, target);

    const aiRun = await this.prisma.aiRun.create({
      data: {
        engagementId: eng.id,
        createdById: userId,
        target,
        chainName: input.chainName,
        // Chaîne : boucle host court-circuitée → SINGLE_HOST.
        strategy: 'SINGLE_HOST',
        status: 'PENDING',
        guardrails: (input.guardrails ?? {}) as Prisma.InputJsonValue,
      },
    });

    try {
      await this.bus.publish<AiRunPayload>(AI_RUN_TOPIC, aiRun.id, {
        aiRunId: aiRun.id,
        engagementId: eng.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to enqueue chain run=${aiRun.id}: ${message}`);
      await this.prisma.aiRun
        .update({
          where: { id: aiRun.id },
          data: { status: 'FAILED', errorMessage: `enqueue failed: ${message}` },
        })
        .catch(() => undefined);
      throw err;
    }

    this.logger.log(`Enqueued chain=${input.chainName} run=${aiRun.id} target=${target}`);
    return aiRun;
  }

  listCapabilities(): Array<
    Pick<
      ChainDefinition,
      'name' | 'displayName' | 'description' | 'whenToUse' | 'produces' | 'scopeAcknowledgement'
    >
  > {
    return this.registry.list().map((c) => ({
      name: c.name,
      displayName: c.displayName,
      description: c.description,
      whenToUse: c.whenToUse,
      produces: c.produces,
      scopeAcknowledgement: c.scopeAcknowledgement,
    }));
  }
}
