import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Scan, ScanTemplate, ScopeRule, TemplateRun } from '@prisma/client';

import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { QueueName, type TemplateRunPayload } from '@autoscanner/queues';

import { RunTemplateInput } from './dto/run-template.input';

type ScopeRuleLike = Pick<ScopeRule, 'ruleType' | 'targetType' | 'value'>;

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.TEMPLATE_RUNS)
    private readonly templateRunsQueue: Queue<TemplateRunPayload>,
  ) {}

  async runTemplate(userId: string, input: RunTemplateInput): Promise<TemplateRun> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: input.engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) {
      throw new NotFoundError('Engagement', input.engagementId);
    }

    const scopeRules = (await this.prisma.scopeRule.findMany({
      where: { engagementId: input.engagementId, ruleType: 'INCLUDE' },
      select: { ruleType: true, targetType: true, value: true },
    })) as ScopeRuleLike[];

    if (!this.isTargetInScope(input.target, scopeRules)) {
      throw new ForbiddenException('target out of scope');
    }

    const template = await this.prisma.scanTemplate.findUnique({
      where: { name: input.templateName },
    });
    if (!template) {
      throw new NotFoundError('ScanTemplate', input.templateName);
    }

    const run = await this.prisma.templateRun.create({
      data: {
        templateId: template.id,
        templateName: template.name,
        engagementId: input.engagementId,
        target: input.target,
        status: 'PENDING',
        currentStepIndex: 0,
        createdById: userId,
      },
    });

    const payload: TemplateRunPayload = {
      templateRunId: run.id,
      engagementId: input.engagementId,
    };
    await this.templateRunsQueue.add('template-run', payload);
    this.logger.log(
      `Enqueued templateRun=${run.id} template=${template.name} target=${input.target}`,
    );

    return run;
  }

  async templateRun(id: string, userId: string): Promise<TemplateRun> {
    const run = await this.prisma.templateRun.findFirst({
      where: { id, engagement: { ownerId: userId, deletedAt: null } },
    });
    if (!run) throw new NotFoundError('TemplateRun', id);
    return run;
  }

  templateRuns(engagementId: string, userId: string): Promise<TemplateRun[]> {
    return this.prisma.templateRun.findMany({
      where: { engagementId, engagement: { ownerId: userId, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
    });
  }

  scanTemplates(): Promise<ScanTemplate[]> {
    return this.prisma.scanTemplate.findMany({
      orderBy: { displayName: 'asc' },
    });
  }

  scansForRun(templateRunId: string): Promise<Scan[]> {
    return this.prisma.scan.findMany({
      where: { templateRunId },
      orderBy: { stepIndex: 'asc' },
    });
  }

  /**
   * Phase 2 scope check (domain targets only):
   *   - DOMAIN: exact match (case-insensitive)
   *   - WILDCARD_DOMAIN: target === value OR target is a subdomain of value
   *   - CIDR / IP / URL: skipped for domain-style targets
   * Only `INCLUDE` rules can grant scope. `EXCLUDE` rules are out of
   * Phase 2 scope (would require subtraction; revisit in a later phase).
   */
  private isTargetInScope(target: string, rules: readonly ScopeRuleLike[]): boolean {
    const t = target.toLowerCase();
    for (const rule of rules) {
      if (rule.ruleType !== 'INCLUDE') continue;
      const value = rule.value.toLowerCase();
      switch (rule.targetType) {
        case 'DOMAIN':
          if (t === value) return true;
          break;
        case 'WILDCARD_DOMAIN':
          if (t === value || t.endsWith(`.${value}`)) return true;
          break;
        case 'CIDR':
        case 'IP':
        case 'URL':
          // Out of Phase 2 scope: these don't match domain targets.
          break;
        default: {
          // Exhaustiveness guard: if a new targetType is added, surface it.
          const _exhaustive: never = rule.targetType;
          void _exhaustive;
        }
      }
    }
    return false;
  }
}
