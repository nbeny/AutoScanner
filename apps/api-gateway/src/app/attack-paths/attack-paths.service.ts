import { Injectable } from '@nestjs/common';
import type { Severity } from '@prisma/client';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import {
  clusterWeight,
  resolveCvssScores,
  SENSITIVE_PORTS,
  ADMIN_TOKENS,
} from '@autoscanner/correlation';

export interface AttackPath {
  correlatedFindingId: string;
  assetValue: string;
  title: string;
  severity: string;
  cveId: string | null;
  score: number;
  exposed: boolean;
  rationale: string;
}

/**
 * Attack-path prioritisation (Part 4 §5), computed over the existing relational model — NO Neo4j.
 * Ranks findings by *attacker gain* rather than raw CVSS: the cluster's severity/CVSS weight is
 * multiplied by an EXPOSURE factor (the asset has an open sensitive port and/or an admin-panel
 * service), so an internet-exposed HIGH on an admin box outranks an isolated CRITICAL. This is the
 * Postgres-native slice; the full Neo4j attack graph (SP6.2) supersedes it when that datastore is
 * stood up.
 */
@Injectable()
export class AttackPathsService {
  constructor(private readonly prisma: PrismaService) {}

  async forEngagement(userId: string, engagementId: string, limit = 25): Promise<AttackPath[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    const clusters = await this.prisma.correlatedFinding.findMany({
      where: { engagementId },
      select: {
        id: true,
        title: true,
        severity: true,
        cveId: true,
        status: true,
        asset: {
          select: {
            canonicalValue: true,
            ports: {
              select: {
                number: true,
                state: true,
                services: { select: { name: true, product: true } },
              },
            },
          },
        },
      },
    });

    const cveIds = clusters.map((c) => c.cveId).filter((c): c is string => !!c);
    const cvss = await resolveCvssScores(this.prisma, cveIds);

    const scored = clusters.map((c) => {
      const base = clusterWeight({
        severity: c.severity as Severity,
        cveId: c.cveId,
        status: c.status,
        cvss: c.cveId ? (cvss.get(c.cveId) ?? null) : null,
      });
      const { factor, exposed, reasons } = this.exposure(c.asset.ports);
      const score = Math.round(base * factor * 10) / 10;
      return {
        correlatedFindingId: c.id,
        assetValue: c.asset.canonicalValue,
        title: c.title,
        severity: String(c.severity),
        cveId: c.cveId,
        score,
        exposed,
        rationale:
          reasons.length > 0
            ? `Base weight ${base}; ${reasons.join(', ')}.`
            : `Base weight ${base}; no elevated exposure detected.`,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private exposure(
    ports: Array<{
      number: number;
      state: string;
      services: Array<{ name: string | null; product: string | null }>;
    }>,
  ): { factor: number; exposed: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let factor = 1;

    const openSensitive = ports.some((p) => p.state === 'OPEN' && SENSITIVE_PORTS.has(p.number));
    if (openSensitive) {
      factor += 0.5;
      reasons.push('open sensitive port');
    }

    const adminService = ports.some((p) =>
      p.services.some((s) =>
        ADMIN_TOKENS.some((t) => `${s.name ?? ''} ${s.product ?? ''}`.toLowerCase().includes(t)),
      ),
    );
    if (adminService) {
      factor += 0.3;
      reasons.push('admin-panel service exposed');
    }

    return { factor, exposed: openSensitive || adminService, reasons };
  }
}
