import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { categorize } from '@autoscanner/correlation';

import { mapFinding } from './mappings/mapper';
import { RULESET } from './mappings/ruleset';

const SOURCE = `ruleset-v${RULESET.version}`;

export interface FindingCreatedEvent {
  engagementId: string;
  findingId?: string;
  cveId?: string | null;
  title?: string;
  templateId?: string | null;
}

/**
 * Maps a finding to control-framework rows (SP2d). The finding's structural category is derived
 * from its title/templateId with the same `categorize` helper the correlator uses, so the
 * mapping is consistent with clustering. Idempotent: `@@unique([engagementId, findingId,
 * framework, controlId])` upserts on re-delivery.
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async map(event: FindingCreatedEvent): Promise<{ mappings: number }> {
    const category = categorize(event.title ?? '', event.templateId);
    const controls = mapFinding({ category, cveId: event.cveId });
    if (controls.length === 0) return { mappings: 0 };

    let persisted = 0;
    for (const c of controls) {
      try {
        await this.prisma.complianceMapping.upsert({
          where: {
            engagementId_findingId_framework_controlId: {
              engagementId: event.engagementId,
              findingId: event.findingId ?? '',
              framework: c.framework,
              controlId: c.controlId,
            },
          },
          create: {
            engagementId: event.engagementId,
            findingId: event.findingId ?? null,
            framework: c.framework,
            controlId: c.controlId,
            controlTitle: c.controlTitle,
            confidence: c.confidence,
            source: SOURCE,
          },
          update: { controlTitle: c.controlTitle, confidence: c.confidence, source: SOURCE },
        });
        persisted++;
      } catch (err) {
        this.logger.warn(
          `compliance upsert failed (${c.framework}/${c.controlId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { mappings: persisted };
  }

  listForEngagement(engagementId: string) {
    return this.prisma.complianceMapping.findMany({
      where: { engagementId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
