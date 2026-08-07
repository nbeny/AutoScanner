import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import type { KaliToolRunPayload } from '@autoscanner/queues';

import { KaliCatalogService } from '../tools/kali-catalog.service';
import type { RunKaliToolInput } from './dto/run-kali-tool.input';
import { KaliToolRunObject } from './dto/kali-tool-run.object';
import { looksLikeTarget, targetHost } from './validate-kali-run';

const REQUESTED_TOPIC = 'security.kalitool.requested';

interface ScopeRuleLike {
  ruleType: string;
  targetType: string;
  value: string;
}

function hostInScope(host: string, rules: readonly ScopeRuleLike[]): boolean {
  for (const r of rules) {
    if (r.ruleType !== 'INCLUDE') continue;
    const v = r.value.toLowerCase();
    if (r.targetType === 'DOMAIN' && host === v) return true;
    if (r.targetType === 'WILDCARD_DOMAIN' && (host === v || host.endsWith(`.${v}`))) return true;
    if (r.targetType === 'IP_ADDRESS' && host === v) return true;
  }
  return false;
}

@Injectable()
export class KaliRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kali: KaliCatalogService,
    @Inject(JOB_BUS) private readonly bus: JobBus,
  ) {}

  async runKaliTool(userId: string, input: RunKaliToolInput): Promise<KaliToolRunObject> {
    // 1. engagement access
    const eng = await this.prisma.engagement.findFirst({ where: { id: input.engagementId } });
    if (!eng) throw new NotFoundException('engagement not found');

    // 2. binary allowlist (SP1 dataset)
    if (!this.kali.findByBinary(input.binary)) {
      throw new ForbiddenException(`unknown / not-allowlisted Kali binary: ${input.binary}`);
    }

    // 3. scope-gate target-like args
    const targets = input.args.filter(looksLikeTarget);
    if (targets.length > 0) {
      const rules = (await this.prisma.scopeRule.findMany({
        where: { engagementId: input.engagementId, ruleType: 'INCLUDE' },
        select: { ruleType: true, targetType: true, value: true },
      })) as ScopeRuleLike[];
      for (const t of targets) {
        if (!hostInScope(targetHost(t), rules)) {
          throw new ForbiddenException(`target out of engagement scope: ${t}`);
        }
      }
    }

    const created = await this.prisma.kaliToolRun.create({
      data: {
        engagementId: input.engagementId,
        createdById: userId,
        binary: input.binary,
        argsJson: input.args,
        target: targets[0] ?? null,
        jsonRequested: input.jsonOutput ?? false,
        status: 'PENDING',
      },
    });

    await this.bus.publish<KaliToolRunPayload>(REQUESTED_TOPIC, created.id, { runId: created.id });
    return this.toObject(created);
  }

  async kaliToolRun(id: string): Promise<KaliToolRunObject | null> {
    const r = await this.prisma.kaliToolRun.findUnique({ where: { id } });
    return r ? this.toObject(r) : null;
  }

  async kaliToolRuns(engagementId: string): Promise<KaliToolRunObject[]> {
    const rows = await this.prisma.kaliToolRun.findMany({
      where: { engagementId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toObject(r));
  }

  private toObject(r: {
    id: string;
    engagementId: string;
    binary: string;
    argsJson: unknown;
    target: string | null;
    status: string;
    outputFormat: string | null;
    exitCode: number | null;
    parsedJson: unknown;
    errorMessage: string | null;
    createdAt?: Date;
  }): KaliToolRunObject {
    return {
      id: r.id,
      engagementId: r.engagementId,
      binary: r.binary,
      args: Array.isArray(r.argsJson) ? (r.argsJson as string[]) : [],
      target: r.target,
      status: r.status,
      outputFormat: r.outputFormat,
      exitCode: r.exitCode,
      parsedJson: r.parsedJson,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    };
  }
}
