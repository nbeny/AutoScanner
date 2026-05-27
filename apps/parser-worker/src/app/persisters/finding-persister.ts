import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedFinding } from '@autoscanner/parsers';

@Injectable()
export class FindingPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(scanJobId: string, assetId: string, finding: NormalizedFinding): Promise<void> {
    const dedupHash = createHash('sha256')
      .update(finding.scannerName)
      .update('\0')
      .update(finding.title)
      .update('\0')
      .update(finding.location ?? '')
      .update('\0')
      .update(finding.cveId ?? '')
      .update('\0')
      .update(finding.templateId ?? '')
      .digest('hex');

    await this.prisma.finding.upsert({
      where: { assetId_dedupHash: { assetId, dedupHash } },
      create: {
        assetId,
        scanJobId,
        dedupHash,
        title: finding.title,
        severity: finding.severity,
        location: finding.location,
        cveId: finding.cveId,
        templateId: finding.templateId,
        evidence: finding.evidence as never,
      },
      update: { lastSeenAt: new Date() },
    });
  }
}
