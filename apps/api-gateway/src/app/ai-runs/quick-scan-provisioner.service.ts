import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@autoscanner/database';
import { ALL_CAPABILITIES, CapabilityService } from '@autoscanner/auth';
import { parseTarget } from '@autoscanner/target-parser';

const QUICK_SCANS_ENGAGEMENT_NAME = 'Quick Scans';

/**
 * Provisions the shared infrastructure an AutoHunt quick scan needs before a
 * run can be enqueued: a per-user "Quick Scans" engagement, all self-granted
 * capabilities (so autonomous scanners are never gated), and an INCLUDE scope
 * rule covering the requested target.
 */
@Injectable()
export class QuickScanProvisioner {
  private readonly logger = new Logger(QuickScanProvisioner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityService,
  ) {}

  /**
   * Find (or lazily create) the user's auto-provisioned "Quick Scans"
   * engagement. Returns just the id so callers can attach runs to it.
   */
  async ensureEngagement(userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.engagement.findFirst({
      where: { ownerId: userId, name: QUICK_SCANS_ENGAGEMENT_NAME, deletedAt: null },
      select: { id: true },
    });
    if (existing) return { id: existing.id };

    const created = await this.prisma.engagement.create({
      data: {
        ownerId: userId,
        name: QUICK_SCANS_ENGAGEMENT_NAME,
        clientName: 'AutoHunt',
        description: 'Auto-provisioned engagement for AutoHunt quick scans.',
      },
      select: { id: true },
    });
    this.logger.log(`Provisioned Quick Scans engagement=${created.id} owner=${userId}`);
    return { id: created.id };
  }

  /**
   * Self-grant every capability to the user so autonomous scanners are never
   * gated on missing permissions. Idempotent — grant() throws on the unique
   * constraint for an existing row, so we guard each key with has() first.
   */
  async grantAllCapabilities(userId: string): Promise<void> {
    for (const key of ALL_CAPABILITIES) {
      if (!(await this.capabilities.has(userId, key))) {
        await this.capabilities.grant(userId, userId, key);
      }
    }
  }

  /**
   * Ensure an INCLUDE scope rule exists for the target. CIDRs map to a CIDR
   * rule; every other IP-like kind maps to an IP rule. Idempotent — skips when
   * a matching rule already exists.
   */
  async addTargetToScope(engagementId: string, target: string): Promise<void> {
    const { kind } = parseTarget(target);
    const targetType = kind === 'ipv4-cidr' || kind === 'ipv6-cidr' ? 'CIDR' : 'IP';

    const existing = await this.prisma.scopeRule.findFirst({
      where: { engagementId, ruleType: 'INCLUDE', value: target },
      select: { id: true },
    });
    if (existing) return;

    await this.prisma.scopeRule.create({
      data: { engagementId, ruleType: 'INCLUDE', targetType, value: target },
    });
    this.logger.log(`Added ${targetType} scope rule "${target}" to engagement=${engagementId}`);
  }
}
