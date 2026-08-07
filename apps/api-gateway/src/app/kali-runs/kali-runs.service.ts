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

const IPV4_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(net);
  if (ipInt === null || netInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  const mask = (bits === 32 ? 0xffffffff : ~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

/**
 * Whether a target host/IP is covered by the engagement's INCLUDE scope rules.
 * `ScopeRuleTarget` values are CIDR | IP | DOMAIN | WILDCARD_DOMAIN | URL.
 */
function hostInScope(host: string, rules: readonly ScopeRuleLike[]): boolean {
  const isIp = IPV4_HOST.test(host);
  for (const r of rules) {
    if (r.ruleType !== 'INCLUDE') continue;
    const v = r.value.toLowerCase();
    switch (r.targetType) {
      case 'DOMAIN':
        if (host === v) return true;
        break;
      case 'WILDCARD_DOMAIN':
        if (host === v || host.endsWith(`.${v}`)) return true;
        break;
      case 'IP':
        if (isIp && host === v) return true;
        break;
      case 'CIDR':
        if (isIp && ipv4InCidr(host, v)) return true;
        break;
      case 'URL': {
        let ruleHost = v;
        try {
          ruleHost = new URL(v).hostname.toLowerCase();
        } catch {
          /* keep raw value */
        }
        if (host === ruleHost) return true;
        break;
      }
    }
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
    // 1. engagement access — must exist, be owned by the caller, and not be soft-deleted
    //    (mirrors ScansService.runScan's engagement guard).
    const eng = await this.prisma.engagement.findFirst({
      where: { id: input.engagementId, ownerId: userId, deletedAt: null },
    });
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
