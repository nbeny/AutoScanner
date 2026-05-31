import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { Job } from 'bullmq';
import {
  ParserRegistry,
  type NormalizedHttpProbe,
  type NormalizedOutput,
} from '@autoscanner/parsers';
import { QueueName, type ParseJobPayload } from '@autoscanner/queues';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import { PrismaService } from '@autoscanner/database';

import {
  AssetMergeService,
  canonicalize,
  recomputeRiskScoreForAsset,
} from '@autoscanner/correlation';
import { Prisma } from '@prisma/client';
import { AssetPersister } from './persisters/asset-persister';
import { DnsRecordPersister } from './persisters/dns-record-persister';
import { FindingPersister } from './persisters/finding-persister';
import { IpAddressPersister } from './persisters/ip-address-persister';
import { PortPersister } from './persisters/port-persister';
import { ServicePersister } from './persisters/service-persister';
import { SubdomainIpPersister } from './persisters/subdomain-ip-persister';
import { TechnologyPersister } from './persisters/technology-persister';

export interface ParseJobResult {
  assetsPersisted: number;
  portsPersisted: number;
  servicesPersisted: number;
  findingsPersisted: number;
  technologiesPersisted: number;
  ipAddressesPersisted: number;
  dnsRecordsPersisted: number;
  subdomainIpsPersisted: number;
}

@Processor(QueueName.PARSE_JOBS, { concurrency: 4 })
export class ParseJobProcessor extends WorkerHost {
  private readonly logger = new Logger(ParseJobProcessor.name);

  constructor(
    private readonly registry: ParserRegistry,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly assetMerge: AssetMergeService,
    private readonly assetPersister: AssetPersister,
    private readonly portPersister: PortPersister,
    private readonly servicePersister: ServicePersister,
    private readonly technologyPersister: TechnologyPersister,
    private readonly findingPersister: FindingPersister,
    private readonly ipAddressPersister: IpAddressPersister,
    private readonly dnsRecordPersister: DnsRecordPersister,
    private readonly subdomainIpPersister: SubdomainIpPersister,
    private readonly prisma: PrismaService,
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
      `parseJob scanJob=${payload.scanJobId} assets=${result.assetsPersisted} ports=${result.portsPersisted} services=${result.servicesPersisted} findings=${result.findingsPersisted} technologies=${result.technologiesPersisted} ipAddresses=${result.ipAddressesPersisted} dnsRecords=${result.dnsRecordsPersisted} subdomainIps=${result.subdomainIpsPersisted}`,
    );

    // Correlation v1: defensive merges/dedups. Each pass is best-effort —
    // persistence already succeeded, so the BullMQ job reports success even
    // if a pass fails. Unique constraints prevent the duplicates these target
    // today; they will become load-bearing in Phase 3+. Run them in declared
    // order: Subdomain merge, IP merge, cross-asset Finding dedup.
    await this.runMergePass('subdomains', () =>
      this.assetMerge.mergeSubdomains(payload.engagementId),
    );
    await this.runMergePass('IpAddress rows', () =>
      this.assetMerge.mergeIpAddresses(payload.engagementId),
    );
    await this.runMergePass('Finding rows', () =>
      this.assetMerge.dedupFindings(payload.engagementId),
    );

    return result;
  }

  /**
   * Run a single correlation pass. Logs a `merged N` line on success when N>0
   * so quiet runs don't spam the log; on failure, logs a warn with stack but
   * never throws — the ParseJob has already succeeded by the time we get here.
   */
  private async runMergePass(kind: string, fn: () => Promise<{ merged: number }>): Promise<void> {
    try {
      const { merged } = await fn();
      if (merged > 0) {
        this.logger.log(`correlation merged ${merged} duplicate ${kind}`);
      }
    } catch (err) {
      this.logger.warn(
        `correlation pass (${kind}) failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async withRetryOnSerializationConflict<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        this.logger.warn('P2034 serialization conflict; retrying once');
        return await fn();
      }
      throw err;
    }
  }

  private async fetchRaw(key: string): Promise<Buffer> {
    const obj = await this.storage.getObject('raw-outputs', key);
    return streamToBuffer(obj.body, MAX_RAW_OUTPUT_BYTES);
  }

  private async persist(payload: ParseJobPayload, out: NormalizedOutput): Promise<ParseJobResult> {
    // assetIdByValue maps lowercased asset value → Asset.id for all asset types.
    // Both AssetPersister (non-IP) and IpAddressPersister (IP) contribute to this map,
    // so that port/service/technology persisters can resolve any asset value to an Asset id.
    const assetIdByValue = new Map<string, string>();
    let assetsPersisted = 0;

    // Index HTTP probes by canonical assetValue so SUBDOMAIN upserts can
    // atomically update Subdomain.httpStatus/httpTitle/httpServer inside the
    // same transaction as the Domain/Subdomain/Asset upserts.
    const httpProbeByValue = new Map<string, NormalizedHttpProbe>();
    for (const probe of out.httpProbes) {
      httpProbeByValue.set(probe.assetValue.toLowerCase(), probe);
    }

    // Non-IP assets: handled by AssetPersister. IP assets are owned by
    // IpAddressPersister (which also creates the Asset pivot with ipAddressId set)
    // — skipping them here avoids double-persistence.
    for (const asset of out.assets) {
      if (asset.type === 'IP') continue;
      const probe = httpProbeByValue.get(asset.value.toLowerCase());
      const id = await this.assetPersister.upsert(payload.engagementId, asset, probe);
      if (!id) continue;
      assetIdByValue.set(asset.value.toLowerCase(), id);
      assetsPersisted++;
    }

    // IP assets: IpAddressPersister owns the IpAddress row + Asset pivot.
    // Processed before ports so that assetIdByValue is fully populated when
    // portPersister resolves IP assetValues (e.g. nmap emits IP + ports together).
    const ipAssetIdByValue = new Map<string, string>();
    let ipAddressesPersisted = 0;
    for (const asset of out.assets) {
      if (asset.type !== 'IP') continue;
      const id = await this.ipAddressPersister.upsert(payload.engagementId, asset);
      if (!id) continue;
      const canonicalIpKey = canonicalize(asset.value, { type: 'IP_ADDRESS' });
      ipAssetIdByValue.set(canonicalIpKey, id);
      // Merge into assetIdByValue so ports/services can resolve the IP's Asset id.
      assetIdByValue.set(asset.value.toLowerCase(), id);
      ipAddressesPersisted++;
    }

    const portIdByKey = new Map<string, string>();
    let portsPersisted = 0;
    for (const port of out.ports) {
      const assetId = assetIdByValue.get(port.assetValue.toLowerCase());
      if (!assetId) continue;
      const id = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          const portId = await this.portPersister.upsert(assetId, port, tx);
          await recomputeRiskScoreForAsset(tx, assetId);
          return portId;
        }),
      );
      portIdByKey.set(portKey(port), id);
      portsPersisted++;
    }

    let servicesPersisted = 0;
    for (const svc of out.services) {
      const portId = portIdByKey.get(
        portKey({ assetValue: svc.assetValue, number: svc.portNumber, protocol: svc.protocol }),
      );
      if (!portId) continue;
      await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          await this.servicePersister.upsert(portId, svc, tx);
          const port = await tx.port.findUnique({
            where: { id: portId },
            select: { assetId: true },
          });
          if (port) await recomputeRiskScoreForAsset(tx, port.assetId);
        }),
      );
      servicesPersisted++;
    }

    let technologiesPersisted = 0;
    for (const tech of out.technologies) {
      const assetId = assetIdByValue.get(tech.assetValue.toLowerCase());
      if (!assetId) continue;
      await this.technologyPersister.upsert(assetId, tech, payload.scannerName);
      technologiesPersisted++;
    }

    let findingsPersisted = 0;
    for (const finding of out.findings) {
      // Findings from URL-anchored scanners (e.g. nuclei) carry `location` as a
      // full URL — resolve it to the canonical host so the Finding attaches to
      // the matching SUBDOMAIN/DOMAIN/IP asset.
      //
      // Resolution order:
      //   1. In-memory map (assets emitted by *this* parse job).
      //   2. DB lookup by canonical host within the engagement, filtered to
      //      live (non-soft-deleted) Asset rows — nuclei usually runs after
      //      subfinder/httpx so the row already exists.
      //
      // No "pick a random asset" fallback: silently attaching a finding to an
      // unrelated asset corrupts attribution downstream (per-asset finding
      // counts, severity rollups, the unified asset view). When resolution
      // fails we log and skip; BullMQ retains the raw output for re-processing
      // once the missing Asset row lands.
      const canonicalHost = urlToCanonicalHost(finding.location);
      let assetId: string | undefined;
      if (canonicalHost) {
        assetId = assetIdByValue.get(canonicalHost);
        if (!assetId) {
          const existing = await this.prisma.asset.findFirst({
            where: {
              engagementId: payload.engagementId,
              canonicalValue: canonicalHost,
              deletedAt: null,
            },
            select: { id: true },
          });
          assetId = existing?.id;
        }
      }
      if (!assetId) {
        this.logger.warn(
          `Skipping Finding: no Asset matched ${canonicalHost ?? '(no location)'} in engagement ${payload.engagementId} (template=${finding.templateId ?? 'unknown'})`,
        );
        continue;
      }
      await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          await this.findingPersister.upsert(
            payload.scanJobId,
            assetId!,
            finding,
            canonicalHost ?? '',
            tx,
          );
          await recomputeRiskScoreForAsset(tx, assetId!);
        }),
      );
      findingsPersisted++;
    }

    // DNS records: look up Subdomain/Domain and create DnsRecord rows.
    let dnsRecordsPersisted = 0;
    for (const record of out.dnsRecords) {
      await this.dnsRecordPersister.upsert(payload.engagementId, record);
      dnsRecordsPersisted++;
    }

    // SubdomainIp joins: for each A/AAAA record whose host is a known Subdomain
    // and whose IP was just persisted, create the join row.
    let subdomainIpsPersisted = 0;
    for (const record of out.dnsRecords) {
      if (record.recordType !== 'A' && record.recordType !== 'AAAA') continue;
      const canonicalIp = canonicalize(record.value, { type: 'IP_ADDRESS' });
      if (!ipAssetIdByValue.has(canonicalIp)) continue;

      // Look up Subdomain id for the host.
      const canonicalHost = canonicalize(record.assetValue, { type: 'SUBDOMAIN' });
      const subdomain = await this.prisma.subdomain.findFirst({
        where: { engagementId: payload.engagementId, canonicalValue: canonicalHost },
        select: { id: true },
      });
      if (!subdomain) continue;

      // Look up IpAddress id (not the Asset id) for the SubdomainIp join.
      const ipAddress = await this.prisma.ipAddress.findFirst({
        where: { engagementId: payload.engagementId, canonicalValue: canonicalIp },
        select: { id: true },
      });
      if (!ipAddress) continue;

      await this.subdomainIpPersister.upsert(subdomain.id, ipAddress.id);
      subdomainIpsPersisted++;
    }

    return {
      assetsPersisted,
      portsPersisted,
      servicesPersisted,
      findingsPersisted,
      technologiesPersisted,
      ipAddressesPersisted,
      dnsRecordsPersisted,
      subdomainIpsPersisted,
    };
  }
}

function portKey(p: { assetValue: string; number: number; protocol: string }): string {
  return `${p.assetValue.toLowerCase()}|${p.number}|${p.protocol}`;
}

/**
 * Extract the canonical host from a Finding.location URL. Returns `undefined`
 * if `location` is missing or fails URL parsing (non-URL scanners may still
 * emit findings without a location). Delegates to
 * `canonicalize(host, { type: 'SUBDOMAIN' })` so the output matches Asset
 * canonicalValues bit-for-bit — including IDN punycode (a finding at
 * `https://bücher.example/` must resolve to the `xn--bcher-kva.example` Asset).
 */
function urlToCanonicalHost(location: string | undefined): string | undefined {
  if (!location) return undefined;
  try {
    const url = new URL(location);
    const host = canonicalize(url.hostname, { type: 'SUBDOMAIN' });
    return host.length > 0 ? host : undefined;
  } catch {
    return undefined;
  }
}

// Hard cap on raw-output size we'll load into memory before parsing.
// A runaway scan (naabu over a /16, nuclei with severity:info on a large
// surface) can produce hundreds of MB; without a cap, an unbounded
// `Buffer.concat` would OOM the parser-worker and silently kill in-flight
// jobs on the same instance. 256 MiB covers normal outputs (nmap XML over
// /16 ≈ 10-50 MiB, large nuclei JSON ≈ 50-200 MiB) and surfaces oversize
// inputs as a clear FAILED job — operator-actionable, not a process crash.
export const MAX_RAW_OUTPUT_BYTES = 256 * 1024 * 1024;

async function streamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      // Best-effort: tell the producer we're done. Some object-storage
      // clients ignore this, but for those that honour it the underlying
      // socket is freed instead of buffering the rest of the response.
      stream.destroy();
      throw new Error(
        `raw output exceeds ${maxBytes} bytes (read at least ${total} before bailing) — refusing to load into memory`,
      );
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
