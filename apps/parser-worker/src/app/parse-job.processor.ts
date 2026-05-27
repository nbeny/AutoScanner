import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Job } from 'bullmq';
import { PrismaService } from '@autoscanner/database';
import {
  ParserRegistry,
  type AssetType as NormalizedAssetType,
  type NormalizedAsset,
  type NormalizedFinding,
  type NormalizedHttpProbe,
  type NormalizedOutput,
  type NormalizedPort,
  type NormalizedService,
  type NormalizedTechnology,
} from '@autoscanner/parsers';
import { QueueName, type ParseJobPayload } from '@autoscanner/queues';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';

import { canonicalize, CorrelationService } from './correlation.service';

export interface ParseJobResult {
  assetsPersisted: number;
  portsPersisted: number;
  servicesPersisted: number;
  findingsPersisted: number;
  technologiesPersisted: number;
}

const ASSET_TYPE_MAP: Record<
  NormalizedAssetType,
  'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS' | 'URL' | 'NETWORK' | null
> = {
  IP: 'IP_ADDRESS',
  DOMAIN: 'DOMAIN',
  SUBDOMAIN: 'SUBDOMAIN',
  URL: 'URL',
  NETBLOCK: 'NETWORK',
  EMAIL: null,
};

// TODO Phase 4: use psl lib for proper Public Suffix List handling.
// Phase 2 simplification: take everything after the first dot, with an apex-domain guard
// (single-dot hosts like `hackerone.com` resolve to themselves rather than `com`).
// Pre-condition: caller passes an already-canonicalized SUBDOMAIN value. The result
// must still be wrapped with canonicalize(..., { type: 'DOMAIN' }) before persisting.
function deriveParentDomain(host: string): string {
  const dotCount = (host.match(/\./g) ?? []).length;
  if (dotCount <= 1) return host;
  const firstDot = host.indexOf('.');
  return host.slice(firstDot + 1);
}

@Processor(QueueName.PARSE_JOBS, { concurrency: 4 })
export class ParseJobProcessor extends WorkerHost {
  private readonly logger = new Logger(ParseJobProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ParserRegistry,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly correlation: CorrelationService,
  ) {
    super();
  }

  async process(job: Job<ParseJobPayload>): Promise<ParseJobResult> {
    const payload = job.data;
    this.logger.log(
      `Processing parseJob scanJob=${payload.scanJobId} parser=${payload.parserName}`,
    );

    const parser = this.registry.get(payload.parserName);

    const raw = await this.fetchRaw(payload.rawOutputKey);
    if (!raw.length) {
      throw new Error(`raw output at ${payload.rawOutputKey} is empty`);
    }

    const output = await parser.parse(raw, {
      scanJobId: payload.scanJobId,
      scannerName: payload.scannerName,
      target: payload.target,
      engagementId: payload.engagementId,
    });

    const result = await this.persist(payload, output);
    this.logger.log(
      `parseJob scanJob=${payload.scanJobId} assets=${result.assetsPersisted} ports=${result.portsPersisted} services=${result.servicesPersisted} findings=${result.findingsPersisted} technologies=${result.technologiesPersisted}`,
    );

    // Correlation v1: defensive merge of duplicate subdomains within the engagement.
    // Best-effort — persistence already succeeded, so the BullMQ job reports success
    // even if correlation fails. The unique constraint on Subdomain prevents the
    // duplicates this targets today; it will become load-bearing in Phase 3+.
    try {
      const { merged } = await this.correlation.mergeSubdomains(payload.engagementId);
      if (merged > 0) {
        this.logger.log(
          `correlation merged ${merged} duplicate subdomains for engagement ${payload.engagementId}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `correlation failed for engagement ${payload.engagementId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    return result;
  }

  private async fetchRaw(key: string): Promise<Buffer> {
    const obj = await this.storage.getObject('raw-outputs', key);
    return streamToBuffer(obj.body);
  }

  private async persist(payload: ParseJobPayload, out: NormalizedOutput): Promise<ParseJobResult> {
    const assetIdByValue = new Map<string, string>();
    let assetsPersisted = 0;

    // Index HTTP probes by canonical assetValue so SUBDOMAIN upserts can
    // atomically update Subdomain.httpStatus/httpTitle/httpServer inside the
    // same transaction as the Domain/Subdomain/Asset upserts.
    const httpProbeByValue = new Map<string, NormalizedHttpProbe>();
    for (const probe of out.httpProbes) {
      httpProbeByValue.set(probe.assetValue.toLowerCase(), probe);
    }

    for (const asset of out.assets) {
      const probe = httpProbeByValue.get(asset.value.toLowerCase());
      const id = await this.upsertAsset(payload.engagementId, asset, probe);
      if (!id) continue;
      assetIdByValue.set(asset.value.toLowerCase(), id);
      assetsPersisted++;
    }

    const portIdByKey = new Map<string, string>();
    let portsPersisted = 0;
    for (const port of out.ports) {
      const assetId = assetIdByValue.get(port.assetValue.toLowerCase());
      if (!assetId) continue;
      const id = await this.upsertPort(assetId, port);
      portIdByKey.set(portKey(port), id);
      portsPersisted++;
    }

    let servicesPersisted = 0;
    for (const svc of out.services) {
      const portId = portIdByKey.get(
        portKey({ assetValue: svc.assetValue, number: svc.portNumber, protocol: svc.protocol }),
      );
      if (!portId) continue;
      await this.upsertService(portId, svc);
      servicesPersisted++;
    }

    let technologiesPersisted = 0;
    for (const tech of out.technologies) {
      const assetId = assetIdByValue.get(tech.assetValue.toLowerCase());
      if (!assetId) continue;
      await this.upsertTechnology(assetId, tech, payload.scannerName);
      technologiesPersisted++;
    }

    let findingsPersisted = 0;
    for (const finding of out.findings) {
      const assetId = findFirstAssetId(assetIdByValue);
      if (!assetId) continue;
      await this.upsertFinding(payload.scanJobId, assetId, finding);
      findingsPersisted++;
    }

    return {
      assetsPersisted,
      portsPersisted,
      servicesPersisted,
      findingsPersisted,
      technologiesPersisted,
    };
  }

  private async upsertAsset(
    engagementId: string,
    asset: NormalizedAsset,
    httpProbe?: NormalizedHttpProbe,
  ): Promise<string | null> {
    const type = ASSET_TYPE_MAP[asset.type];
    if (!type) return null;

    // SUBDOMAIN assets require recon-chain upserts (Domain + Subdomain rows) and
    // a SUBDOMAIN pivot Asset that sets subdomainId (CHECK constraint enforces this).
    if (type === 'SUBDOMAIN') {
      return this.upsertSubdomainChain(engagementId, asset, httpProbe);
    }

    // type ∈ { DOMAIN, IP_ADDRESS, URL, NETWORK }. We canonicalize DOMAIN and
    // IP_ADDRESS with the matching canonicalize() variant; URL and NETWORK
    // fall through to a trim-only default (lowercase would mangle URL paths).
    const canonicalValue =
      type === 'DOMAIN'
        ? canonicalize(asset.value, { type: 'DOMAIN' })
        : type === 'IP_ADDRESS'
          ? canonicalize(asset.value, { type: 'IP_ADDRESS' })
          : asset.value.trim();
    const existing = await this.prisma.asset.findFirst({
      where: { engagementId, type, canonicalValue, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.asset.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return existing.id;
    }
    const created = await this.prisma.asset.create({
      data: { engagementId, type, value: asset.value, canonicalValue },
      select: { id: true },
    });
    return created.id;
  }

  private async upsertSubdomainChain(
    engagementId: string,
    asset: NormalizedAsset,
    httpProbe?: NormalizedHttpProbe,
  ): Promise<string> {
    const canonicalValue = canonicalize(asset.value, { type: 'SUBDOMAIN' });
    const parentDomain = canonicalize(deriveParentDomain(canonicalValue), { type: 'DOMAIN' });

    return this.prisma.$transaction(async (tx) => {
      const domain = await tx.domain.upsert({
        where: {
          engagementId_canonicalValue: { engagementId, canonicalValue: parentDomain },
        },
        create: { engagementId, value: parentDomain, canonicalValue: parentDomain },
        update: { lastSeenAt: new Date() },
        select: { id: true },
      });

      const subdomain = await tx.subdomain.upsert({
        where: {
          engagementId_canonicalValue: { engagementId, canonicalValue },
        },
        create: {
          engagementId,
          domainId: domain.id,
          value: asset.value,
          canonicalValue,
        },
        update: { lastSeenAt: new Date(), domainId: domain.id },
        select: { id: true },
      });

      // Apply httpx-derived HTTP fields onto the Subdomain row inside the same
      // transaction so the row is consistent end-to-end. Partial probes are
      // safe: Prisma treats `undefined` as "don't write this column," so a
      // second httpx run that lacks a title won't clobber an existing one.
      if (
        httpProbe &&
        (httpProbe.status !== undefined ||
          httpProbe.title !== undefined ||
          httpProbe.server !== undefined)
      ) {
        await tx.subdomain.update({
          where: { id: subdomain.id },
          data: {
            httpStatus: httpProbe.status,
            httpTitle: httpProbe.title,
            httpServer: httpProbe.server,
          },
        });
      }

      const existingAsset = await tx.asset.findFirst({
        where: {
          engagementId,
          type: 'SUBDOMAIN',
          canonicalValue,
          subdomainId: subdomain.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existingAsset) {
        await tx.asset.update({
          where: { id: existingAsset.id },
          data: { lastSeenAt: new Date() },
        });
        return existingAsset.id;
      }

      const created = await tx.asset.create({
        data: {
          engagementId,
          type: 'SUBDOMAIN',
          value: asset.value,
          canonicalValue,
          subdomainId: subdomain.id,
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  private async upsertPort(assetId: string, port: NormalizedPort): Promise<string> {
    const row = await this.prisma.port.upsert({
      where: {
        assetId_number_protocol: { assetId, number: port.number, protocol: port.protocol },
      },
      create: { assetId, number: port.number, protocol: port.protocol, state: port.state },
      update: { state: port.state, lastSeenAt: new Date() },
      select: { id: true },
    });
    return row.id;
  }

  private async upsertService(portId: string, svc: NormalizedService): Promise<void> {
    const existing = await this.prisma.service.findFirst({
      where: {
        portId,
        name: svc.name ?? null,
        product: svc.product ?? null,
        version: svc.version ?? null,
      },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.service.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), banner: svc.extraInfo ?? undefined, cpe: svc.cpe ?? [] },
      });
      return;
    }
    await this.prisma.service.create({
      data: {
        portId,
        name: svc.name,
        product: svc.product,
        version: svc.version,
        banner: svc.extraInfo,
        cpe: svc.cpe ?? [],
      },
    });
  }

  // Technology has a nullable `version` column in its composite unique index.
  // Postgres treats NULLs as distinct in unique indexes, so prisma.upsert via
  // the (assetId, name, version) compound key fails when version is undefined.
  // We use findFirst + create/update instead (mirroring upsertService).
  private async upsertTechnology(
    assetId: string,
    tech: NormalizedTechnology,
    scannerName: string,
  ): Promise<void> {
    const existing = await this.prisma.technology.findFirst({
      where: {
        assetId,
        name: tech.name,
        version: tech.version ?? null,
      },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.technology.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          categories: tech.categories ?? undefined,
        },
      });
      return;
    }
    await this.prisma.technology.create({
      data: {
        assetId,
        name: tech.name,
        version: tech.version,
        source: scannerName,
        categories: tech.categories ?? undefined,
      },
    });
  }

  private async upsertFinding(
    scanJobId: string,
    assetId: string,
    finding: NormalizedFinding,
  ): Promise<void> {
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

function portKey(p: { assetValue: string; number: number; protocol: string }): string {
  return `${p.assetValue.toLowerCase()}|${p.number}|${p.protocol}`;
}

function findFirstAssetId(map: Map<string, string>): string | undefined {
  for (const id of map.values()) return id;
  return undefined;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
