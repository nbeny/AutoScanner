import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { type CapabilityKey } from './capability.constants';

@Injectable()
export class CapabilityService {
  private readonly logger = new Logger(CapabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async has(userId: string, key: CapabilityKey): Promise<boolean> {
    const row = await this.prisma.userCapability.findUnique({
      where: { userId_key: { userId, key } },
      select: { id: true },
    });
    return row !== null;
  }

  async grant(adminUserId: string, userId: string, key: CapabilityKey): Promise<void> {
    await this.prisma.userCapability.create({
      data: { userId, key, grantedBy: adminUserId },
    });
    this.logger.log(`capability grant key=${key} userId=${userId} by=${adminUserId}`);
  }

  async revoke(adminUserId: string, userId: string, key: CapabilityKey): Promise<void> {
    await this.prisma.userCapability.delete({
      where: { userId_key: { userId, key } },
    });
    this.logger.log(`capability revoke key=${key} userId=${userId} by=${adminUserId}`);
  }
}
