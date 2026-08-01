import { Injectable } from '@nestjs/common';

import { PrismaService } from '@autoscanner/database';
import { canonicalize } from '@autoscanner/correlation';

/**
 * The distilled, per-target picture of everything discovered so far in an AI
 * run. This is serialized into the decision prompt so Claude can reason about
 * what to scan next without re-deriving state from raw scanner output.
 */
export interface WorldState {
  target: string;
  openPorts: { port: number; protocol: string }[];
  services: { port: number; name?: string; version?: string }[];
  technologies: { name: string; version?: string }[];
  urls: string[];
  endpoints: string[];
  findings: { title: string; severity: string }[];
  scannersRun: string[];
}

/** A bare IPv4/IPv6 literal canonicalises as an IP; anything else as a hostname. */
function inferAssetType(target: string): 'IP_ADDRESS' | 'SUBDOMAIN' {
  return /^[0-9.]+$/.test(target) || target.includes(':') ? 'IP_ADDRESS' : 'SUBDOMAIN';
}

@Injectable()
export class WorldStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assemble the {@link WorldState} for one target within an AI run. Host-scoped
   * entities (ports/services/technologies) hang off the {@link Asset} whose
   * `value` equals the target; if that asset does not exist yet the host-scoped
   * arrays come back empty. URLs/endpoints and findings are engagement/run
   * scoped respectively.
   */
  async build(aiRunId: string, engagementId: string, target: string): Promise<WorldState> {
    const [scanJobs, findingRows, asset, endpointRows] = await Promise.all([
      this.prisma.scanJob.findMany({
        where: { scan: { aiRunId } },
        select: { scannerName: true },
      }),
      this.prisma.finding.findMany({
        where: { scanJob: { scan: { aiRunId } } },
        select: { title: true, severity: true },
      }),
      // Match the canonical form, not the raw value: every writer stores `canonicalValue`
      // (that is what the partial unique index is on), so a raw match silently missed
      // assets whose value differs in case/IDN/IPv6 form. Soft-deleted rows are excluded
      // for the same reason every other read path excludes them.
      this.prisma.asset.findFirst({
        where: {
          engagementId,
          canonicalValue: canonicalize(target, { type: inferAssetType(target) }),
          deletedAt: null,
        },
        select: { id: true },
      }),
      this.prisma.endpoint.findMany({
        where: { engagementId },
        select: { canonicalUrl: true },
      }),
    ]);

    const scannersRun = [...new Set(scanJobs.map((j) => j.scannerName))];

    const findings = findingRows.map((f) => ({
      title: f.title,
      severity: String(f.severity),
    }));

    const openPorts: WorldState['openPorts'] = [];
    const services: WorldState['services'] = [];
    const technologies: WorldState['technologies'] = [];

    if (asset) {
      const [portRows, techRows] = await Promise.all([
        this.prisma.port.findMany({
          where: { assetId: asset.id, state: 'OPEN' },
          select: {
            number: true,
            protocol: true,
            services: { select: { name: true, version: true } },
          },
        }),
        this.prisma.technology.findMany({
          where: { assetId: asset.id },
          select: { name: true, version: true },
        }),
      ]);

      for (const p of portRows) {
        openPorts.push({ port: p.number, protocol: String(p.protocol) });
        for (const s of p.services) {
          services.push({
            port: p.number,
            name: s.name ?? undefined,
            version: s.version ?? undefined,
          });
        }
      }

      for (const t of techRows) {
        technologies.push({ name: t.name, version: t.version ?? undefined });
      }
    }

    const urls = endpointRows.map((e) => e.canonicalUrl);

    return {
      target,
      openPorts,
      services,
      technologies,
      urls,
      endpoints: [...urls],
      findings,
      scannersRun,
    };
  }
}
