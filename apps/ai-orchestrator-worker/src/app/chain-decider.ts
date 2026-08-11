import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { ChainRegistry, CHAIN_REGISTRY, type ChainStep, type InputRef } from '@autoscanner/chains';
import {
  evaluate,
  buildAudit,
  type StepEvaluation,
  type AuditInput,
} from '@autoscanner/chain-engine';

import { WorldStateService } from './world-state.service';
import { ResolvableEntitiesLoader } from './entities-loader.service';
import type {
  NextStepDecider,
  DecideArgs,
  AuditArgs,
  DecisionOutcome,
  DecisionAction,
} from './next-step-decider';

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

/** Résout les inputs statiques d'un step (v1 : `kind=context` ignoré). */
function staticInputs(step: ChainStep): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, ref] of Object.entries(step.inputs ?? {})) {
    const r = ref as InputRef;
    if (r.kind === 'static') out[k] = r.value;
  }
  return out;
}

@Injectable()
export class ChainDecider implements NextStepDecider {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHAIN_REGISTRY) private readonly registry: ChainRegistry,
    private readonly worldState: WorldStateService,
    private readonly entities: ResolvableEntitiesLoader,
  ) {}

  async decide(args: DecideArgs): Promise<DecisionOutcome> {
    const chain = this.registry.get(args.chainName ?? '');

    const executedRows = await this.prisma.aiRunNode.findMany({
      where: { aiRunId: args.aiRunId, stepId: { not: null } },
      select: { stepId: true },
    });
    const executed = new Set(executedRows.map((r) => r.stepId as string));

    const world = await this.worldState.buildChainSnapshot(
      args.aiRunId,
      args.engagementId,
      args.host,
    );
    const entities = await this.entities.load(args.engagementId);

    const result = evaluate(chain, world, entities, executed);
    if (result.done || !result.next) {
      return { done: true, actions: [], snapshot: { done: true } };
    }

    const step = result.next;
    const def = chain.steps.find((s) => s.id === step.stepId)!;
    const actions: DecisionAction[] = this.toActions(step, def);
    return { done: false, actions, snapshot: step };
  }

  private toActions(step: StepEvaluation, def: ChainStep): DecisionAction[] {
    if (step.action === 'skip') {
      return [
        {
          kind: 'skip',
          scannerName: step.scannerName,
          target: step.targets[0]?.value ?? '',
          stepId: step.stepId,
          skipReason: step.skipReason ?? 'skip',
        },
      ];
    }
    const inputs = staticInputs(def);
    return step.targets
      .filter((t) => t.keep)
      .map((t) => ({
        kind: 'run' as const,
        scannerName: step.scannerName,
        target: t.value,
        inputs,
        stepId: step.stepId,
        rationale: `chain step ${step.stepId}`,
      }));
  }

  async audit(args: AuditArgs): Promise<string> {
    const run = await this.prisma.aiRun.findUnique({
      where: { id: args.aiRunId },
      select: { chainName: true },
    });
    const chain = this.registry.get(run?.chainName ?? '');

    // La trace des StepEvaluation est persistée round par round dans AiDecision.responseJson.
    const decisions = await this.prisma.aiDecision.findMany({
      where: { aiRunId: args.aiRunId },
      orderBy: { round: 'asc' },
      select: { responseJson: true },
    });
    const steps = decisions
      .map((d) => d.responseJson as unknown as StepEvaluation)
      .filter((s) => s && typeof s === 'object' && 'stepId' in s);

    const [ipCount, endpointCount, techRows, findingRows] = await Promise.all([
      this.prisma.ipAddress.count({
        where: { engagement: { aiRuns: { some: { id: args.aiRunId } } } },
      }),
      this.prisma.endpoint.count({
        where: { engagement: { aiRuns: { some: { id: args.aiRunId } } } },
      }),
      this.prisma.technology.findMany({
        where: { asset: { engagement: { aiRuns: { some: { id: args.aiRunId } } } } },
        select: { name: true },
        distinct: ['name'],
      }),
      this.prisma.finding.findMany({
        where: { scanJob: { scan: { aiRunId: args.aiRunId } } },
        select: { severity: true },
      }),
    ]);

    const bySeverity: Record<string, number> = {};
    for (const f of findingRows) {
      const s = String(f.severity).toUpperCase();
      bySeverity[s] = (bySeverity[s] ?? 0) + 1;
    }

    const input: AuditInput = {
      chainDisplayName: chain.displayName,
      target: args.target,
      steps,
      discovered: {
        ipAddresses: ipCount,
        technologies: techRows.map((t) => t.name),
        endpoints: endpointCount,
        findings: { total: findingRows.length, bySeverity },
      },
    };
    void SEVERITY_ORDER; // ordre géré dans buildAudit
    return buildAudit(input);
  }
}
