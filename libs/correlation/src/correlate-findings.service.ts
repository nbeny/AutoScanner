import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { structuralFindingHash } from './structural-finding-hash';

type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const SEVERITY_ORDER: Record<Severity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function maxSeverity(severities: Severity[]): Severity {
  return severities.reduce((best, s) => (SEVERITY_ORDER[s] > SEVERITY_ORDER[best] ? s : best));
}

interface FindingRow {
  id: string;
  title: string;
  location: string | null;
  cveId: string | null;
  templateId: string | null;
  severity: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  asset: { id: string; canonicalValue: string };
  scanJob: { scannerName: string };
}

interface ClusterGroup {
  memberIds: string[];
  severities: Severity[];
  scannerNames: Set<string>;
  cveIds: (string | null)[];
  titles: string[];
  minFirstSeenAt: Date;
  maxLastSeenAt: Date;
  assetId: string;
  category: string | null;
  structuralHash: string;
  engagementId: string;
}

@Injectable()
export class CorrelateFindingsService {
  private readonly logger = new Logger(CorrelateFindingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Group all findings in the engagement by structural hash and upsert a
   * CorrelatedFinding cluster for each group. Findings are then linked back to
   * their cluster via `correlatedFindingId` and `structuralHash`.
   *
   * CRITICAL: `status` is intentionally absent from both the `create` and
   * `update` payloads so that operator triage (OPEN → ACKNOWLEDGED → FIXED)
   * is never overwritten by re-scans.
   */
  async correlateFindings(engagementId: string): Promise<{ clusters: number }> {
    const findings = await this.prisma.finding.findMany({
      where: { asset: { engagementId } },
      select: {
        id: true,
        title: true,
        location: true,
        cveId: true,
        templateId: true,
        severity: true,
        firstSeenAt: true,
        lastSeenAt: true,
        asset: { select: { id: true, canonicalValue: true } },
        scanJob: { select: { scannerName: true } },
      },
    });

    if (findings.length === 0) {
      return { clusters: 0 };
    }

    // Group by assetId|structuralHash
    const groups = new Map<string, ClusterGroup>();

    for (const f of findings as FindingRow[]) {
      const { hash, category } = structuralFindingHash({
        scannerName: f.scanJob.scannerName,
        cveId: f.cveId,
        assetCanonical: f.asset.canonicalValue,
        location: f.location,
        title: f.title,
        templateId: f.templateId,
      });

      const groupKey = `${f.asset.id}|${hash}`;
      const existing = groups.get(groupKey);

      if (existing) {
        existing.memberIds.push(f.id);
        existing.severities.push(f.severity as Severity);
        existing.scannerNames.add(f.scanJob.scannerName);
        existing.cveIds.push(f.cveId);
        existing.titles.push(f.title);
        if (f.firstSeenAt < existing.minFirstSeenAt) {
          existing.minFirstSeenAt = f.firstSeenAt;
        }
        if (f.lastSeenAt > existing.maxLastSeenAt) {
          existing.maxLastSeenAt = f.lastSeenAt;
        }
      } else {
        groups.set(groupKey, {
          memberIds: [f.id],
          severities: [f.severity as Severity],
          scannerNames: new Set([f.scanJob.scannerName]),
          cveIds: [f.cveId],
          titles: [f.title],
          minFirstSeenAt: f.firstSeenAt,
          maxLastSeenAt: f.lastSeenAt,
          assetId: f.asset.id,
          category,
          structuralHash: hash,
          engagementId,
        });
      }
    }

    for (const group of groups.values()) {
      const severity = maxSeverity(group.severities);
      const distinctScanners = group.scannerNames.size;
      const firstCveId = group.cveIds.find((c) => c != null) ?? null;
      const title = firstCveId ?? group.category ?? group.titles[0];

      try {
        const cluster = await this.prisma.correlatedFinding.upsert({
          where: {
            assetId_structuralHash: {
              assetId: group.assetId,
              structuralHash: group.structuralHash,
            },
          },
          create: {
            engagementId: group.engagementId,
            assetId: group.assetId,
            structuralHash: group.structuralHash,
            category: group.category,
            title,
            severity,
            cveId: firstCveId,
            sourceCount: distinctScanners,
            firstSeenAt: group.minFirstSeenAt,
            lastSeenAt: group.maxLastSeenAt,
          },
          update: {
            category: group.category,
            title,
            severity,
            cveId: firstCveId,
            sourceCount: distinctScanners,
            lastSeenAt: group.maxLastSeenAt,
          },
        });

        await this.prisma.finding.updateMany({
          where: { id: { in: group.memberIds } },
          data: { correlatedFindingId: cluster.id, structuralHash: group.structuralHash },
        });

        this.logger.debug(
          `correlated ${group.memberIds.length} finding(s) into cluster ${cluster.id} (hash=${group.structuralHash.slice(0, 12)}…, engagement=${engagementId})`,
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        this.logger.warn(
          `correlate group (hash=${group.structuralHash.slice(0, 12)}…) failed (engagement=${engagementId}, code=${code ?? 'unknown'}): ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        // Continue to next group — partial success is preferable to total failure.
      }
    }

    return { clusters: groups.size };
  }
}
