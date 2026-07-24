import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import { QueueName, type AiRunPayload } from '@autoscanner/queues';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { ClaudeAgentService } from '@autoscanner/claude-agent';
import { ScanDispatcher, type DispatchItem } from '@autoscanner/scan-dispatch';
import { parseTarget } from '@autoscanner/target-parser';

import { WorldStateService, type WorldState } from './world-state.service';
import { buildScannerCatalog, catalogToPromptText } from './scanner-catalog';
import { buildSystemPrompt, buildUserPrompt, buildAuditPrompt } from './decision-prompt';
import { validateDecision, type ValidatedDecision } from './decision-validator';
import {
  evaluateGuardrails,
  DEFAULT_GUARDRAILS,
  type Guardrails,
  type RunProgress,
} from './guardrails';
import { AiRunEventsPublisher } from './ai-run-events.publisher';

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
@Processor(QueueName.AI_RUNS)
export class AiRunProcessor extends WorkerHost {
  private readonly logger = new Logger(AiRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScannerRegistry,
    private readonly claude: ClaudeAgentService,
    private readonly dispatcher: ScanDispatcher,
    private readonly worldState: WorldStateService,
    private readonly events: AiRunEventsPublisher,
  ) {
    super();
  }

  async process(job: Job<AiRunPayload>): Promise<void> {
    const aiRunId = job.data.aiRunId;
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

      const hosts = await this.resolveHosts(aiRun, guardrails);

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

      const findingRows = await this.prisma.finding.findMany({
        where: { scanJob: { scan: { aiRunId } } },
        select: { title: true, severity: true },
      });
      const findings = findingRows.map((f) => ({ title: f.title, severity: String(f.severity) }));

      const decisionRows = await this.prisma.aiDecision.findMany({
        where: { aiRunId },
        orderBy: { round: 'asc' },
        select: { round: true },
      });
      // AiDecision carries no rationale column; summarise as round markers.
      const decisions = decisionRows.map((d) => ({ round: d.round, rationale: '' }));

      const auditResp = await this.claude.complete({
        system: buildSystemPrompt(),
        prompt: buildAuditPrompt({ target: aiRun.target, findings, decisions }),
      });
      const auditText = auditResp.text.trim() || this.fallbackAudit(findings);

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
   * Drive the decide -> dispatch loop for a single host until Claude signals
   * done, proposes nothing, or a guardrail trips.
   */
  private async runHostLoop(args: {
    aiRunId: string;
    engagementId: string;
    createdById: string;
    host: string;
    guardrails: Guardrails;
    startedAt: Date;
    startDepth: number;
  }): Promise<{ stoppedByCap: boolean; degraded: boolean }> {
    const { aiRunId, engagementId, createdById, host, guardrails, startedAt, startDepth } = args;

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

      const progress: RunProgress = {
        scanCount,
        depth,
        elapsedMs: Date.now() - startedAt.getTime(),
      };
      const gr = evaluateGuardrails(guardrails, progress);
      if (gr.stop) {
        stoppedByCap = true;
        break;
      }

      const worldState = await this.worldState.build(aiRunId, engagementId, host);
      const catalogText = catalogToPromptText(buildScannerCatalog(this.registry));
      const budgetRemaining = {
        scans: guardrails.maxScans - scanCount,
        depth: guardrails.maxDepth - depth,
      };

      const resp = await this.claude.complete({
        system: buildSystemPrompt(),
        prompt: buildUserPrompt({ worldState, catalogText, budgetRemaining }),
      });

      let degraded = false;
      let decision: ValidatedDecision;
      if (!resp.text.trim()) {
        degraded = true;
        decision = this.fallbackDecision(worldState);
      } else {
        decision = validateDecision(resp.safeJson<unknown>(null), this.registry);
        if (decision.next.length === 0 && !decision.done) {
          // Claude returned something unusable — one degraded fallback attempt.
          degraded = true;
          decision = this.fallbackDecision(worldState);
        }
      }
      if (degraded) degradedRun = true;

      await this.prisma.aiDecision.create({
        data: {
          aiRunId,
          round,
          worldStateSnapshot: worldState as unknown as Prisma.InputJsonValue,
          responseJson: (resp.text
            ? resp.safeJson<Prisma.InputJsonValue>({ raw: resp.text } as Prisma.InputJsonValue)
            : { degraded: true }) as Prisma.InputJsonValue,
          degraded,
        },
      });

      if (decision.done || decision.next.length === 0) break;

      // Materialise proposed scans as nodes, then dispatch.
      const nodeIds: string[] = [];
      for (const p of decision.next) {
        const node = await this.prisma.aiRunNode.create({
          data: {
            aiRunId,
            parentNodeId: lastRoundNodeId,
            scannerName: p.scannerName,
            target: p.target,
            depth,
            rationale: p.why,
            status: 'RUNNING',
          },
          select: { id: true },
        });
        nodeIds.push(node.id);
      }
      lastRoundNodeId = nodeIds[0] ?? lastRoundNodeId;

      const items: DispatchItem[] = decision.next.map((p, i) => ({
        engagementId,
        createdById,
        scannerName: p.scannerName,
        target: p.target,
        input: p.inputs,
        aiRunId,
        aiRunNodeId: nodeIds[i],
        name: p.scannerName,
      }));
      const results = await this.dispatcher.dispatchMany(items);

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const nodeId = nodeIds[i];
        if (!nodeId) continue;
        await this.prisma.aiRunNode.update({
          where: { id: nodeId },
          data: { status: result.status, scanId: result.scanId || null },
        });
        await this.events.publish(aiRunId, {
          type: 'node',
          nodeId,
          scannerName: result ? decision.next[i]?.scannerName : undefined,
          status: result.status,
          scanId: result.scanId || null,
        });
      }

      await this.prisma.aiRun.update({
        where: { id: aiRunId },
        data: { scanCount: { increment: results.length }, currentDepth: depth + 1 },
      });

      depth++;
      round++;
      await this.events.publish(aiRunId, { type: 'progress', depth, round });
    }

    return { stoppedByCap, degraded: degradedRun };
  }

  /**
   * Deterministic methodology used when the model output is empty or unusable.
   * Only proposes scanners the registry actually has, and returns `done` once
   * the obvious next steps are exhausted so the loop always terminates.
   */
  private fallbackDecision(worldState: WorldState): ValidatedDecision {
    const has = (n: string): boolean => this.registry.has(n);

    if (worldState.scannersRun.length === 0 && has('nmap')) {
      return {
        done: false,
        rationale: 'degraded fallback: baseline recon',
        next: [
          {
            scannerName: 'nmap',
            target: worldState.target,
            inputs: {},
            why: 'baseline recon (degraded fallback)',
          },
        ],
      };
    }

    if (worldState.openPorts.length > 0 && worldState.technologies.length === 0 && has('httpx')) {
      return {
        done: false,
        rationale: 'degraded fallback: web fingerprinting',
        next: [
          {
            scannerName: 'httpx',
            target: worldState.target,
            inputs: {},
            why: 'fingerprint web tech (degraded fallback)',
          },
        ],
      };
    }

    if (worldState.urls.length > 0 && has('nuclei')) {
      return {
        done: false,
        rationale: 'degraded fallback: vuln scan',
        next: [
          {
            scannerName: 'nuclei',
            target: worldState.urls[0],
            inputs: {},
            why: 'vulnerability scan (degraded fallback)',
          },
        ],
      };
    }

    return { done: true, rationale: 'degraded: nothing further', next: [] };
  }

  /** Minimal Markdown audit used when Claude returns no audit text. */
  private fallbackAudit(findings: { title: string; severity: string }[]): string {
    const counts = new Map<string, number>();
    for (const f of findings) {
      const sev = f.severity.toUpperCase();
      counts.set(sev, (counts.get(sev) ?? 0) + 1);
    }
    const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    const lines = order.filter((s) => counts.has(s)).map((s) => `- ${s}: ${counts.get(s)}`);
    const others = [...counts.keys()].filter((s) => !order.includes(s));
    for (const s of others) lines.push(`- ${s}: ${counts.get(s)}`);

    return [
      '# AutoHunt Audit (degraded)',
      '',
      `Total findings: ${findings.length}`,
      '',
      '## Findings by severity',
      lines.length > 0 ? lines.join('\n') : '- none',
    ].join('\n');
  }
}
