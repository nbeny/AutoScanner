import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Severity } from '@prisma/client';
import { PrismaService } from '@autoscanner/database';

import {
  THREAT_INTEL_SOURCES,
  type ThreatIntelSource,
  type ThreatSignal,
} from './sources/threat-intel-source';

export interface FindingCreatedEvent {
  engagementId: string;
  findingId?: string;
  cveId?: string | null;
  assetId?: string;
  title?: string;
  severity?: string;
  location?: string | null;
}

/**
 * Runs every registered source against a finding and persists the signals as `ThreatIntel`
 * rows. Idempotent: the `@@unique([engagementId, indicator, source, kind])` constraint means a
 * redelivered event upserts the same row. Best-effort per source — one provider failing never
 * drops another's signals.
 */
@Injectable()
export class ThreatIntelService {
  private readonly logger = new Logger(ThreatIntelService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(THREAT_INTEL_SOURCES) private readonly sources: ThreatIntelSource[],
  ) {}

  async enrich(event: FindingCreatedEvent): Promise<{ signals: number }> {
    const input = { cveId: event.cveId ?? null, assetValue: event.location ?? null };

    const signals: ThreatSignal[] = [];
    for (const source of this.sources) {
      try {
        signals.push(...(await source.lookup(input)));
      } catch (err) {
        this.logger.warn(
          `source ${source.name} failed for finding ${event.findingId ?? '(none)'}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    let persisted = 0;
    for (const s of signals) {
      try {
        await this.prisma.threatIntel.upsert({
          where: {
            engagementId_indicator_source_kind: {
              engagementId: event.engagementId,
              indicator: s.indicator,
              source: s.source,
              kind: s.kind,
            },
          },
          create: {
            engagementId: event.engagementId,
            findingId: event.findingId ?? null,
            cveId: event.cveId ?? null,
            indicator: s.indicator,
            kind: s.kind,
            source: s.source,
            severity: s.severity as Severity,
            payload: (s.payload ?? {}) as never,
          },
          update: {
            findingId: event.findingId ?? null,
            severity: s.severity as Severity,
            payload: (s.payload ?? {}) as never,
            observedAt: new Date(),
          },
        });
        persisted++;
      } catch (err) {
        this.logger.warn(
          `threat-intel upsert failed (${s.source}/${s.kind}/${s.indicator}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { signals: persisted };
  }

  listForEngagement(engagementId: string) {
    return this.prisma.threatIntel.findMany({
      where: { engagementId },
      orderBy: { observedAt: 'desc' },
    });
  }
}
