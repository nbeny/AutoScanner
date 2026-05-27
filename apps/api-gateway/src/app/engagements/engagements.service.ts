import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { Engagement, ScopeRule } from '@prisma/client';
import { CreateEngagementInput } from './dto/create-engagement.input';
import { CreateScopeRuleInput } from './dto/create-scope-rule.input';

@Injectable()
export class EngagementsService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, input: CreateEngagementInput): Promise<Engagement> {
    return this.prisma.engagement.create({
      data: {
        ownerId,
        name: input.name,
        clientName: input.clientName,
        description: input.description ?? null,
        scopeText: input.scopeText ?? null,
      },
    });
  }

  listForOwner(ownerId: string): Promise<Engagement[]> {
    return this.prisma.engagement.findMany({
      where: { ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdForOwner(ownerId: string, id: string): Promise<Engagement> {
    const found = await this.prisma.engagement.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (!found) throw new NotFoundError('Engagement', id);
    return found;
  }

  async createScopeRule(ownerId: string, input: CreateScopeRuleInput): Promise<ScopeRule> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: input.engagementId, ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', input.engagementId);

    return this.prisma.scopeRule.create({
      data: {
        engagementId: input.engagementId,
        ruleType: input.ruleType,
        targetType: input.targetType,
        value: input.value,
        notes: input.notes ?? null,
      },
    });
  }
}
