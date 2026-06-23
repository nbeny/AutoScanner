import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, SecretBox } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { EngagementAuthInput, EngagementAuthStatus } from './dto/engagement-auth.dto';
import { SECRET_BOX } from './secret-box.provider';

@Injectable()
export class EngagementAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
  ) {}

  /** Throws unless the engagement exists and is owned by the user (not soft-deleted). */
  private async assertOwned(userId: string, engagementId: string): Promise<void> {
    const eng = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!eng) throw new NotFoundError('Engagement', engagementId);
  }

  async set(userId: string, engagementId: string, input: EngagementAuthInput): Promise<boolean> {
    await this.assertOwned(userId, engagementId);
    const headers =
      input.headers && input.headers.length > 0
        ? Object.fromEntries(input.headers.map((h) => [h.name, h.value]))
        : undefined;
    const payload = JSON.stringify({
      ...(input.cookie ? { cookie: input.cookie } : {}),
      ...(headers ? { headers } : {}),
    });
    const ciphertext = this.box.seal(payload);
    await this.prisma.engagementAuthProfile.upsert({
      where: { engagementId },
      create: { engagementId, ciphertext },
      update: { ciphertext },
    });
    return true;
  }

  async status(userId: string, engagementId: string): Promise<EngagementAuthStatus> {
    await this.assertOwned(userId, engagementId);
    const row = await this.prisma.engagementAuthProfile.findUnique({
      where: { engagementId },
      select: { updatedAt: true },
    });
    return { configured: row !== null, updatedAt: row?.updatedAt };
  }

  async delete(userId: string, engagementId: string): Promise<boolean> {
    await this.assertOwned(userId, engagementId);
    const result = await this.prisma.engagementAuthProfile.deleteMany({ where: { engagementId } });
    return result.count > 0;
  }
}
