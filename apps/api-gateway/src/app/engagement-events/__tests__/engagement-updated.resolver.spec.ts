import { ForbiddenException } from '@nestjs/common';
import type { User } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';

import type { EngagementEventsSubscriberService } from '../engagement-events-subscriber.service';
import { EngagementUpdatedResolver } from '../engagement-updated.resolver';

function makePrisma(found: boolean): jest.Mocked<PrismaService> {
  return {
    engagement: {
      findFirst: jest.fn().mockResolvedValue(found ? { id: 'eng_1' } : null),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

describe('EngagementUpdatedResolver', () => {
  const user = { id: 'user_1' } as User;

  it('forbids when engagement is not owned by user', async () => {
    const prisma = makePrisma(false);
    const sub = {
      subscribe: jest.fn(),
    } as unknown as EngagementEventsSubscriberService;
    const r = new EngagementUpdatedResolver(prisma, sub);
    await expect(r.engagementUpdated(user, 'eng_1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(sub.subscribe).not.toHaveBeenCalled();
  });

  it('delegates to subscriber when ownership ok', async () => {
    const prisma = makePrisma(true);
    const asyncIt = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: undefined as never, done: true }),
      }),
    };
    const sub = {
      subscribe: jest.fn().mockReturnValue(asyncIt),
    } as unknown as EngagementEventsSubscriberService;
    const r = new EngagementUpdatedResolver(prisma, sub);
    const result = await r.engagementUpdated(user, 'eng_1');
    expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
      where: { id: 'eng_1', ownerId: 'user_1', deletedAt: null },
      select: { id: true },
    });
    expect(sub.subscribe).toHaveBeenCalledWith('eng_1');
    expect(result).toBe(asyncIt);
  });
});
