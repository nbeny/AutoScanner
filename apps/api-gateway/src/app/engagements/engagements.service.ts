import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import type { Engagement } from '@prisma/client';
import { CreateEngagementInput } from './dto/create-engagement.input';

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
}
