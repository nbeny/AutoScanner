import { Injectable } from '@nestjs/common';
import type { Severity } from '@prisma/client';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { clusterWeight } from '@autoscanner/correlation';
import { CorrelatedFindingObject } from './dto/correlated-finding.object';
import { FindingStatus } from './dto/finding-status.enum';

type CorrelatedFindingRow = {
  id: string;
  assetId: string;
  structuralHash: string;
  category: string | null;
  title: string;
  severity: Severity;
  cveId: string | null;
  status: FindingStatus;
  sourceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  findings: Array<{ scanJob: { scannerName: string } }>;
};

@Injectable()
export class CorrelatedFindingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertEngagementOwned(userId: string, engagementId: string): Promise<void> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);
  }

  private mapRow(row: CorrelatedFindingRow, riskScore: number): CorrelatedFindingObject {
    const sources = [...new Set(row.findings.map((f) => f.scanJob.scannerName))];
    return {
      id: row.id,
      assetId: row.assetId,
      structuralHash: row.structuralHash,
      category: row.category,
      title: row.title,
      severity: row.severity,
      cveId: row.cveId,
      status: row.status,
      sourceCount: row.sourceCount,
      sources,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      riskScore,
    };
  }

  async list(
    userId: string,
    engagementId: string,
    opts: {
      severity?: Severity | null;
      status?: FindingStatus | null;
      search?: string | null;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<CorrelatedFindingObject[]> {
    await this.assertEngagementOwned(userId, engagementId);

    const { severity, status, search, limit, offset } = opts;

    const rows = (await this.prisma.correlatedFinding.findMany({
      where: {
        engagementId,
        ...(severity ? { severity } : {}),
        ...(status ? { status } : {}),
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      take: limit ?? 100,
      skip: offset ?? 0,
      include: {
        findings: {
          select: {
            scanJob: { select: { scannerName: true } },
          },
        },
      },
    })) as CorrelatedFindingRow[];

    const cveIds = [...new Set(rows.map((r) => r.cveId).filter((c): c is string => !!c))];
    const cves = cveIds.length
      ? await this.prisma.nvdCve.findMany({
          where: { cveId: { in: cveIds } },
          select: { cveId: true, cvssV3Score: true },
        })
      : [];
    const cvssByCve = new Map(cves.map((c) => [c.cveId, c.cvssV3Score]));

    const scored = rows.map((row) => ({
      row,
      riskScore: clusterWeight({
        severity: row.severity,
        cveId: row.cveId,
        status: row.status,
        cvss: row.cveId ? (cvssByCve.get(row.cveId) ?? null) : null,
      }),
    }));

    scored.sort(
      (a, b) =>
        b.riskScore - a.riskScore || b.row.lastSeenAt.getTime() - a.row.lastSeenAt.getTime(),
    );

    return scored.map(({ row, riskScore }) => this.mapRow(row, riskScore));
  }

  async setStatus(
    userId: string,
    id: string,
    status: FindingStatus,
    note?: string | null,
  ): Promise<CorrelatedFindingObject> {
    const cluster = await this.prisma.correlatedFinding.findUnique({
      where: { id },
      select: { engagementId: true, status: true },
    });
    if (!cluster) throw new NotFoundError('CorrelatedFinding', id);

    await this.assertEngagementOwned(userId, cluster.engagementId);

    const updated = (await this.prisma.$transaction(async (tx) => {
      const row = await tx.correlatedFinding.update({
        where: { id },
        data: { status },
        include: { findings: { select: { scanJob: { select: { scannerName: true } } } } },
      });
      await tx.findingStatusEvent.create({
        data: {
          correlatedFindingId: id,
          fromStatus: cluster.status,
          toStatus: status,
          actorId: userId,
          note: note ?? null,
        },
      });
      return row;
    })) as CorrelatedFindingRow;

    return this.mapRow(updated, this.scoreForRow(updated));
  }

  private scoreForRow(row: CorrelatedFindingRow): number {
    // setStatus returns a single row; the CVSS-aware score is delivered by the
    // list/detail queries. Here we fall back to the severity bucket (cvss: null).
    return clusterWeight({
      severity: row.severity,
      cveId: row.cveId,
      status: row.status,
      cvss: null,
    });
  }
}
