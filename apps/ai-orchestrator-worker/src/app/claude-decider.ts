import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { ClaudeAgentService } from '@autoscanner/claude-agent';

import { WorldStateService, type WorldState } from './world-state.service';
import { buildScannerCatalog, catalogToPromptText } from './scanner-catalog';
import { buildSystemPrompt, buildUserPrompt, buildAuditPrompt } from './decision-prompt';
import { validateDecision, type ValidatedDecision } from './decision-validator';
import type {
  NextStepDecider,
  DecideArgs,
  AuditArgs,
  DecisionOutcome,
  DecisionAction,
} from './next-step-decider';

@Injectable()
export class ClaudeDecider implements NextStepDecider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScannerRegistry,
    private readonly claude: ClaudeAgentService,
    private readonly worldState: WorldStateService,
  ) {}

  async decide(args: DecideArgs): Promise<DecisionOutcome> {
    const world = await this.worldState.build(args.aiRunId, args.engagementId, args.host);
    const catalogText = catalogToPromptText(buildScannerCatalog(this.registry));

    const resp = await this.claude.complete({
      system: buildSystemPrompt(),
      prompt: buildUserPrompt({
        worldState: world,
        catalogText,
        budgetRemaining: args.budgetRemaining,
      }),
    });

    let degraded = false;
    let decision: ValidatedDecision;
    if (!resp.text.trim()) {
      degraded = true;
      decision = this.fallbackDecision(world);
    } else {
      decision = validateDecision(resp.safeJson<unknown>(null), this.registry);
      if (decision.next.length === 0 && !decision.done) {
        degraded = true;
        decision = this.fallbackDecision(world);
      }
    }

    const actions: DecisionAction[] = decision.next.map((p) => ({
      kind: 'run',
      scannerName: p.scannerName,
      target: p.target,
      inputs: p.inputs,
      rationale: p.why,
    }));

    return { done: decision.done || actions.length === 0, actions, degraded, snapshot: world };
  }

  async audit(args: AuditArgs): Promise<string> {
    const findingRows = await this.prisma.finding.findMany({
      where: { scanJob: { scan: { aiRunId: args.aiRunId } } },
      select: { title: true, severity: true },
    });
    const findings = findingRows.map((f) => ({ title: f.title, severity: String(f.severity) }));

    const decisionRows = await this.prisma.aiDecision.findMany({
      where: { aiRunId: args.aiRunId },
      orderBy: { round: 'asc' },
      select: { round: true },
    });
    // AiDecision carries no rationale column; summarise as round markers.
    const decisions = decisionRows.map((d) => ({ round: d.round, rationale: '' }));

    const resp = await this.claude.complete({
      system: buildSystemPrompt(),
      prompt: buildAuditPrompt({ target: args.target, findings, decisions }),
    });
    return resp.text.trim() || this.fallbackAudit(findings);
  }

  private fallbackDecision(world: WorldState): ValidatedDecision {
    const has = (n: string): boolean => this.registry.has(n);
    if (world.scannersRun.length === 0 && has('nmap')) {
      return {
        done: false,
        rationale: 'degraded: baseline recon',
        next: [{ scannerName: 'nmap', target: world.target, inputs: {}, why: 'baseline recon' }],
      };
    }
    if (world.openPorts.length > 0 && world.technologies.length === 0 && has('httpx')) {
      return {
        done: false,
        rationale: 'degraded: fingerprint',
        next: [{ scannerName: 'httpx', target: world.target, inputs: {}, why: 'fingerprint' }],
      };
    }
    if (world.urls.length > 0 && has('nuclei')) {
      return {
        done: false,
        rationale: 'degraded: vuln',
        next: [{ scannerName: 'nuclei', target: world.urls[0], inputs: {}, why: 'vuln scan' }],
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
