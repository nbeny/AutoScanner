import { Injectable, Logger } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { ScansService } from '../scans/scans.service';
import { EmailObject } from './dto/email.object';
import { IdentityObject } from './dto/identity.object';
import { OrgMetadataObject } from './dto/org-metadata.object';
import { OsintLaunchObject, OsintRunResultObject } from './dto/osint-run-result.object';
import { RunOsintScanInput } from './dto/run-osint-scan.input';
import { OSINT_PRESETS } from './osint-presets';

@Injectable()
export class OsintService {
  private readonly logger = new Logger(OsintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scans: ScansService,
  ) {}

  private async assertOwnedEngagement(userId: string, engagementId: string): Promise<void> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);
  }

  async emails(userId: string, engagementId: string): Promise<EmailObject[]> {
    await this.assertOwnedEngagement(userId, engagementId);
    return this.prisma.email.findMany({
      where: { engagementId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async orgMetadata(userId: string, engagementId: string): Promise<OrgMetadataObject[]> {
    await this.assertOwnedEngagement(userId, engagementId);
    return this.prisma.orgMetadata.findMany({
      where: { engagementId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async identities(userId: string, engagementId: string, seed?: string): Promise<IdentityObject[]> {
    await this.assertOwnedEngagement(userId, engagementId);
    return this.prisma.identity.findMany({
      where: { engagementId, ...(seed ? { seed } : {}) },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /**
   * Fan out the curated OSINT scanner set for the seed type. Each step is
   * dispatched through the normal `runScan` path (which validates the scanner,
   * asserts engagement ownership, and enqueues). Returns the launched scanners
   * so the UI can confirm what was dispatched.
   */
  async runOsintScan(userId: string, input: RunOsintScanInput): Promise<OsintRunResultObject> {
    const seed = input.seed.trim();
    if (!seed) throw new NotFoundError('OsintSeed', input.seed);
    await this.assertOwnedEngagement(userId, input.engagementId);

    const steps = OSINT_PRESETS[input.seedType];
    const launches: OsintLaunchObject[] = [];
    for (const step of steps) {
      const target = step.target ? step.target(seed) : seed;
      const scan = await this.scans.runScan(userId, {
        engagementId: input.engagementId,
        scannerName: step.scanner,
        target,
        optionsJson: '',
      });
      launches.push({ scannerName: step.scanner, scanId: scan.id });
    }

    this.logger.log(
      `OSINT run seed="${seed}" type=${input.seedType} → ${launches.length} scanners`,
    );
    return { seed, seedType: input.seedType, count: launches.length, launches };
  }
}
