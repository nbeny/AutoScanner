import { Logger, Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import type { AiRunPayload } from '@autoscanner/queues';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { ScanDispatcher } from '@autoscanner/scan-dispatch';
import { parseTarget } from '@autoscanner/target-parser';

import { evaluateGuardrails, DEFAULT_GUARDRAILS, type Guardrails } from './guardrails';
import { AiRunEventsPublisher } from './ai-run-events.publisher';
import { ClaudeDecider } from './claude-decider';
import { ChainDecider } from './chain-decider';
import type { NextStepDecider, DecisionAction } from './next-step-decider';

const AI_RUN_TOPIC = 'security.ai.run.requested';

/** Terminal statuses that make (re)processing a no-op under at-least-once delivery. */
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED_CAP']);

/** Discovery scanners tried, in order, to expand a CIDR/range into hosts. */
const DISCOVERY_SCANNERS = ['naabu', 'nmap', 'mapcidr'] as const;

/**
 * Consumer for the `ai-runs` queue — the agentic scan-decision loop.
 *
 * Per host it repeatedly builds a {@link WorldState}, asks Claude which
 * scanner(s) to run next, validates + dispatches them via {@link ScanDispatcher},
 * records the decision graph as {@link Prisma.AiRunNodeCreateInput} rows, and
 * enforces {@link Guardrails}. When Claude signals done (or a cap trips) it asks
 * Claude for a Markdown audit and finalises the run. Degraded rounds (empty or
 * unusable model output) fall back to a small deterministic methodology so the
 * run always makes forward progress and terminates.
 */
@Injectable()
export class AiRunProcessor
  extends MessageConsumer<AiRunPayload>
  implements OnApplicationBootstrap
{
  readonly topic = AI_RUN_TOPIC;
  private readonly logger = new Logger(AiRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScannerRegistry,
    private readonly dispatcher: ScanDispatcher,
    private readonly events: AiRunEventsPublisher,
    private readonly claudeDecider: ClaudeDecider,
    private readonly chainDecider: ChainDecider,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  /** Sélection du décideur selon le type de run. */
  private deciderFor(chainName: string | null): NextStepDecider {
    return chainName ? this.chainDecider : this.claudeDecider;
  }

  async process(ctx: MessageContext<AiRunPayload>): Promise<void> {
    const aiRunId = ctx.payload.aiRunId;
    const aiRun = await this.prisma.aiRun.findUnique({ where: { id: aiRunId } });
    if (!aiRun) {
      this.logger.warn(`AiRun ${aiRunId} not found — dropping job`);
      return;
    }
    if (TERMINAL_STATUSES.has(aiRun.status)) {
      this.logger.log(`AiRun ${aiRunId} already terminal (${aiRun.status}) — skipping`);
      return;
    }

    const guardrails: Guardrails = {
      ...DEFAULT_GUARDRAILS,
      ...((aiRun.guardrails as Record<string, unknown>) ?? {}),
    };
    const startedAt = aiRun.startedAt ?? new Date();

    try {
      await this.prisma.aiRun.update({
        where: { id: aiRunId },
        data: { status: 'RUNNING', startedAt },
      });
      await this.events.publish(aiRunId, { type: 'status', status: 'RUNNING' });

      const decider = this.deciderFor(aiRun.chainName ?? null);
      const hosts = aiRun.chainName ? [aiRun.target] : await this.resolveHosts(aiRun, guardrails);

      let stoppedByCap = false;
      let degradedRun = false;

      for (const host of hosts) {
        const outcome = await this.runHostLoop({
          aiRunId,
          engagementId: aiRun.engagementId,
          createdById: aiRun.createdById,
          host,
          guardrails,
          startedAt,
          startDepth: aiRun.currentDepth ?? 0,
          decider,
          chainName: aiRun.chainName ?? null,
        });
        if (outcome.stoppedByCap) stoppedByCap = true;
        if (outcome.degraded) degradedRun = true;
        if (outcome.stoppedByCap) break;
      }

      if (degradedRun) {
        await this.prisma.aiRun.update({ where: { id: aiRunId }, data: { degraded: true } });
      }

      // ---- Audit ----
      await this.prisma.aiRun.update({ where: { id: aiRunId }, data: { status: 'AUDITING' } });
      await this.events.publish(aiRunId, { type: 'status', status: 'AUDITING' });

      const auditText = await decider.audit({ aiRunId, target: aiRun.target });

      const finalStatus = stoppedByCap ? 'STOPPED_CAP' : 'COMPLETED';
      await this.prisma.aiRun.update({
        where: { id: aiRunId },
        data: { status: finalStatus, auditText, completedAt: new Date() },
      });
      await this.events.publish(aiRunId, { type: 'audit-ready' });
      await this.events.publish(aiRunId, { type: 'status', status: finalStatus });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`AiRun ${aiRunId} failed: ${errorMessage}`);
      await this.prisma.aiRun
        .update({ where: { id: aiRunId }, data: { status: 'FAILED', errorMessage } })
        .catch(() => undefined);
      await this.events.publish(aiRunId, { type: 'status', status: 'FAILED', errorMessage });
      throw err; // let BullMQ record the failure / apply retry policy
    }
  }

  /**
   * Turn the run's seed target into the concrete list of hosts to scan, applying
   * `hostCap`. SINGLE_HOST / RANGE_AGGREGATE resolve to the seed itself;
   * RANGE_PER_HOST first runs a best-effort discovery scan and reads back the
   * discovered IPs.
   */
  private async resolveHosts(
    aiRun: { id: string; engagementId: string; createdById: string; target: string },
    guardrails: Guardrails,
  ): Promise<string[]> {
    const parsed = parseTarget(aiRun.target);

    if (parsed.strategy !== 'RANGE_PER_HOST') {
      return [aiRun.target];
    }

    await this.prisma.aiRun.update({
      where: { id: aiRun.id },
      data: { status: 'DISCOVERING' },
    });
    await this.events.publish(aiRun.id, { type: 'status', status: 'DISCOVERING' });

    const scannerName = DISCOVERY_SCANNERS.find((s) => this.registry.has(s));
    if (scannerName) {
      const node = await this.prisma.aiRunNode.create({
        data: {
          aiRunId: aiRun.id,
          parentNodeId: null,
          scannerName,
          target: aiRun.target,
          depth: 0,
          rationale: 'range discovery',
          status: 'RUNNING',
        },
        select: { id: true },
      });
      const [result] = await this.dispatcher.dispatchMany([
        {
          engagementId: aiRun.engagementId,
          createdById: aiRun.createdById,
          scannerName,
          target: aiRun.target,
          input: {},
          aiRunId: aiRun.id,
          aiRunNodeId: node.id,
          name: `discovery:${scannerName}`,
        },
      ]);
      if (result) {
        await this.prisma.aiRunNode.update({
          where: { id: node.id },
          data: { status: result.status, scanId: result.scanId || null },
        });
        await this.events.publish(aiRun.id, {
          type: 'node',
          nodeId: node.id,
          scannerName,
          status: result.status,
        });
      }
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: { scanCount: { increment: 1 } },
      });
    }

    const ipRows = await this.prisma.ipAddress.findMany({
      where: { engagementId: aiRun.engagementId },
      select: { value: true },
    });
    const discovered = [...new Set(ipRows.map((r) => r.value))].slice(0, guardrails.hostCap);
    return discovered.length > 0 ? discovered : [aiRun.target];
  }

  /**
   * Drive the decide -> dispatch loop for a single host until the decider signals
   * done, proposes nothing, or a guardrail trips. The loop is decider-agnostic:
   * the same body drives {@link ClaudeDecider} (AI runs) or {@link ChainDecider}
   * (logical chains) via the unified {@link NextStepDecider} contract.
   */
  private async runHostLoop(args: {
    aiRunId: string;
    engagementId: string;
    createdById: string;
    host: string;
    guardrails: Guardrails;
    startedAt: Date;
    startDepth: number;
    decider: NextStepDecider;
    chainName: string | null;
  }): Promise<{ stoppedByCap: boolean; degraded: boolean }> {
    const {
      aiRunId,
      engagementId,
      createdById,
      host,
      guardrails,
      startedAt,
      startDepth,
      decider,
      chainName,
    } = args;

    let depth = startDepth;
    let round = 0;
    let lastRoundNodeId: string | null = null;
    let stoppedByCap = false;
    let degradedRun = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const fresh = await this.prisma.aiRun.findUnique({
        where: { id: aiRunId },
        select: { scanCount: true },
      });
      const scanCount = fresh?.scanCount ?? 0;
      const gr = evaluateGuardrails(guardrails, {
        scanCount,
        depth,
        elapsedMs: Date.now() - startedAt.getTime(),
      });
      if (gr.stop) {
        stoppedByCap = true;
        break;
      }

      const outcome = await decider.decide({
        aiRunId,
        engagementId,
        host,
        chainName,
        budgetRemaining: {
          scans: guardrails.maxScans - scanCount,
          depth: guardrails.maxDepth - depth,
        },
      });
      if (outcome.degraded) degradedRun = true;

      await this.prisma.aiDecision.create({
        data: {
          aiRunId,
          round,
          worldStateSnapshot: (outcome.snapshot ?? {}) as Prisma.InputJsonValue,
          responseJson: (outcome.snapshot ?? {}) as Prisma.InputJsonValue,
          degraded: outcome.degraded ?? false,
        },
      });

      if (outcome.done || outcome.actions.length === 0) break;

      // Matérialiser les nœuds (run + skip).
      const runActions: DecisionAction[] = [];
      const nodeIds: string[] = [];
      for (const action of outcome.actions) {
        const node = await this.prisma.aiRunNode.create({
          data: {
            aiRunId,
            parentNodeId: lastRoundNodeId,
            scannerName: action.scannerName,
            target: action.target,
            depth,
            rationale: action.kind === 'run' ? action.rationale : null,
            stepId: action.stepId ?? null,
            skipReason: action.kind === 'skip' ? action.skipReason : null,
            status: action.kind === 'skip' ? 'CANCELLED' : 'RUNNING',
          },
          select: { id: true },
        });
        await this.events.publish(aiRunId, {
          type: 'node',
          nodeId: node.id,
          scannerName: action.scannerName,
          status: action.kind === 'skip' ? 'CANCELLED' : 'RUNNING',
          skipReason: action.kind === 'skip' ? action.skipReason : undefined,
        });
        if (action.kind === 'run') {
          runActions.push(action);
          nodeIds.push(node.id);
        }
      }
      lastRoundNodeId = nodeIds[0] ?? lastRoundNodeId;

      if (runActions.length > 0) {
        const items = runActions.map((a, i) => ({
          engagementId,
          createdById,
          scannerName: a.scannerName,
          target: a.target,
          input: a.kind === 'run' ? a.inputs : {},
          aiRunId,
          aiRunNodeId: nodeIds[i],
          name: a.scannerName,
        }));
        const results = await this.dispatcher.dispatchMany(items);
        for (let i = 0; i < results.length; i++) {
          const nodeId = nodeIds[i];
          if (!nodeId) continue;
          await this.prisma.aiRunNode.update({
            where: { id: nodeId },
            data: { status: results[i].status, scanId: results[i].scanId || null },
          });
          await this.events.publish(aiRunId, {
            type: 'node',
            nodeId,
            scannerName: runActions[i]?.scannerName,
            status: results[i].status,
            scanId: results[i].scanId || null,
          });
        }
        await this.prisma.aiRun.update({
          where: { id: aiRunId },
          data: { scanCount: { increment: results.length }, currentDepth: depth + 1 },
        });
      }

      depth++;
      round++;
      await this.events.publish(aiRunId, { type: 'progress', depth, round });
    }

    return { stoppedByCap, degraded: degradedRun };
  }
}
