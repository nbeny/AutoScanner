import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { Job, Queue } from 'bullmq';
import {
  ParserRegistry,
  type NormalizedHttpProbe,
  type NormalizedOutput,
} from '@autoscanner/parsers';
import {
  QueueName,
  type ParseJobPayload,
  type CveEnrichmentPayload,
  type CveDiscoveryPayload,
} from '@autoscanner/queues';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import { PrismaService } from '@autoscanner/database';
import {
  ENGAGEMENT_EVENTS_PUBLISHER,
  EngagementUpdateKind,
  type EngagementEventsPublisher,
} from '@autoscanner/engagement-events';

import {
  AssetMergeService,
  CorrelateFindingsService,
  canonicalize,
  recomputeRiskScoreForAsset,
  writeObservation,
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
import { EndpointPersister } from './persisters/endpoint-persister';
import { EmailPersister } from './persisters/email-persister';
import { OrgMetadataPersister } from './persisters/org-metadata-persister';
import { TlsCertificatePersister } from './persisters/tls-certificate-persister';

export interface ParseJobResult {
  assetsPersisted: number;
  portsPersisted: number;
  servicesPersisted: number;
  findingsPersisted: number;
  technologiesPersisted: number;
  ipAddressesPersisted: number;
  dnsRecordsPersisted: number;
  subdomainIpsPersisted: number;
  endpointsPersisted: number;
  emailsPersisted: number;
  orgMetadataPersisted: number;
  tlsCertificatesPersisted: number;
  correlatedFindings: number;
}

@Processor(QueueName.PARSE_JOBS, { concurrency: 4 })
export class ParseJobProcessor extends WorkerHost {
  private readonly logger = new Logger(ParseJobProcessor.name);

  constructor(
    private readonly registry: ParserRegistry,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly assetMerge: AssetMergeService,
    private readonly correlateFindings: CorrelateFindingsService,
    private readonly assetPersister: AssetPersister,
    private readonly portPersister: PortPersister,
    private readonly servicePersister: ServicePersister,
    private readonly technologyPersister: TechnologyPersister,
    private readonly findingPersister: FindingPersister,
    private readonly ipAddressPersister: IpAddressPersister,
    private readonly dnsRecordPersister: DnsRecordPersister,
    private readonly subdomainIpPersister: SubdomainIpPersister,
    private readonly endpointPersister: EndpointPersister,
    private readonly emailPersister: EmailPersister,
    private readonly orgMetadataPersister: OrgMetadataPersister,
    private readonly tlsCertificatePersister: TlsCertificatePersister,
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.CVE_ENRICHMENT) private readonly cveQueue: Queue<CveEnrichmentPayload>,
    @InjectQueue(QueueName.CVE_DISCOVERY)
    private readonly cveDiscoveryQueue: Queue<CveDiscoveryPayload>,
    @Inject(ENGAGEMENT_EVENTS_PUBLISHER)
    private readonly events: EngagementEventsPublisher,
  ) {
    super();
  }

  private publish(
    engagementId: string,
    kind: EngagementUpdateKind,
    extra: { assetId?: string } = {},
  ): void {
    this.events
      .publish({
        kind,
        engagementId,
        assetId: extra.assetId,
        ts: new Date().toISOString(),
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Engagement event publish failed (${kind}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
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

    // Collect distinct cveIds BEFORE persistence so we can enqueue AFTER the
    // transaction commits. Aggregating from the parsed output (not from DB rows)
    // is safe: BullMQ deduplicates by jobId, so re-enqueuing an already-enriched
    // CVE is a no-op. We only enqueue for cveIds that actually made it through
    // the findings loop (i.e. had a matching Asset), but over-enqueueing is
    // harmless because the enricher worker is idempotent.
    const cveIdsToEnqueue = new Set<string>(
      output.findings.filter((f) => f.cveId).map((f) => f.cveId as string),
    );

    const result = await this.persist(payload, output);

    await this.warnIfObservationVolumeExceeded(payload.scanJobId);

    // Enqueue CVE_ENRICHMENT jobs for each distinct cveId found in the persisted
    // findings. Each enqueue is wrapped individually so one failure doesn't
    // prevent subsequent cveIds from being enqueued. Failures are logged as
    // warnings and must NOT fail the parse job.
    for (const cveId of cveIdsToEnqueue) {
      try {
        await this.cveQueue.add('enrich', { cveId }, { jobId: cveId });
      } catch (err) {
        this.logger.warn(
          `CVE_ENRICHMENT enqueue failed for ${cveId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Enqueue CVE_DISCOVERY jobs for each (service, cpe) pair in this engagement.
    // We query by engagement scope (port.asset.engagementId) so any service-with-CPE
    // persisted by earlier parse jobs in the same engagement is also covered. This is
    // intentionally engagement-wide: BullMQ deduplicates by jobId (`${svc.id}:${cpe}`)
    // so re-enqueueing an already-discovered pair is a no-op, and the discovery
    // processor + finding.upsert are idempotent.
    try {
      const cpeServices = await this.prisma.service.findMany({
        where: {
          cpe: { isEmpty: false },
          port: { asset: { engagementId: payload.engagementId } },
        },
        select: {
          id: true,
          cpe: true,
          product: true,
          version: true,
          port: {
            select: {
              assetId: true,
              number: true,
              protocol: true,
              asset: { select: { value: true, canonicalValue: true } },
            },
          },
        },
      });
      for (const svc of cpeServices) {
        const assetId = svc.port.assetId;
        const assetCanonical = svc.port.asset.canonicalValue;
        const location = `${svc.port.asset.value}:${svc.port.number}/${svc.port.protocol.toLowerCase()}`;
        for (const cpe of svc.cpe) {
          try {
            await this.cveDiscoveryQueue.add(
              'discover',
              {
                scanJobId: payload.scanJobId,
                engagementId: payload.engagementId,
                assetId,
                assetCanonical,
                serviceId: svc.id,
                cpe,
                location,
                product: svc.product ?? undefined,
                version: svc.version ?? undefined,
              },
              { jobId: `${svc.id}:${cpe}` },
            );
          } catch (err) {
            this.logger.warn(
              `CVE_DISCOVERY enqueue failed for ${svc.id}:${cpe}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `CVE_DISCOVERY service query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

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

    // Correlation v2: structural-hash clustering. Groups findings by CVE /
    // category / raw-scanner bucket across scanner sources and upserts
    // CorrelatedFinding clusters. Best-effort — parse job reports success
    // even if this pass fails.
    let correlatedFindings = 0;
    await this.runCorrelatePass(payload.engagementId, (n) => {
      correlatedFindings = n;
    });

    // Risk-score v2: recompute risk for all assets in the engagement that have
    // findings, AFTER the correlate pass, so computeRiskScore sees the updated
    // CorrelatedFinding clusters (count-once + CVSS). The per-persist calls
    // above keep port/service bonuses up-to-date during ingestion; this pass
    // finalises the cluster-based contribution. Best-effort — parse job reports
    // success even if this pass fails.
    await this.runRiskRecomputePass(payload.engagementId);

    const finalResult = { ...result, correlatedFindings };
    this.logger.log(
      `parseJob scanJob=${payload.scanJobId} assets=${finalResult.assetsPersisted} ports=${finalResult.portsPersisted} services=${finalResult.servicesPersisted} findings=${finalResult.findingsPersisted} technologies=${finalResult.technologiesPersisted} ipAddresses=${finalResult.ipAddressesPersisted} dnsRecords=${finalResult.dnsRecordsPersisted} subdomainIps=${finalResult.subdomainIpsPersisted} endpoints=${finalResult.endpointsPersisted} emails=${finalResult.emailsPersisted} orgMetadata=${finalResult.orgMetadataPersisted} tlsCertificates=${finalResult.tlsCertificatesPersisted} correlatedFindings=${finalResult.correlatedFindings}`,
    );
    return finalResult;
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

  /**
   * Run the structural-hash clustering pass (correlation v2). Logs
   * `correlated N clusters` on success; on failure logs a warn but never
   * throws — the ParseJob has already succeeded by the time we get here.
   */
  private async runCorrelatePass(
    engagementId: string,
    onSuccess: (clusters: number) => void,
  ): Promise<void> {
    try {
      const { clusters } = await this.correlateFindings.correlateFindings(engagementId);
      if (clusters > 0) {
        this.logger.log(`correlated ${clusters} clusters`);
      }
      onSuccess(clusters);
    } catch (err) {
      this.logger.warn(
        `correlation pass (correlate findings) failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Recompute risk scores for all assets in the engagement that have findings,
   * AFTER the correlate pass has run.  This ensures riskScore reflects the v2
   * formula (count-once over CorrelatedFinding clusters + CVSS) rather than
   * the interim per-persist values written during ingestion.
   *
   * Each asset is recomputed in its own retried transaction so one conflict
   * does not abort the whole pass.  Best-effort: failures are logged as
   * warnings and do NOT fail the parse job.
   */
  private async runRiskRecomputePass(engagementId: string): Promise<void> {
    try {
      // Find all distinct assets that have at least one finding in this
      // engagement.  We use the findings table rather than correlatedFindings
      // because an asset may have findings that haven't been clustered yet (e.g.
      // if the correlate pass failed) and we still want to recompute them.
      const assetRows = await this.prisma.finding.findMany({
        where: { asset: { engagementId } },
        select: { assetId: true },
        distinct: ['assetId'],
      });
      const assetIds = assetRows.map((r) => r.assetId);

      for (const assetId of assetIds) {
        try {
          await this.withRetryOnSerializationConflict(() =>
            this.prisma.$transaction(async (tx) => {
              await recomputeRiskScoreForAsset(tx, assetId);
            }),
          );
          this.publish(engagementId, EngagementUpdateKind.ASSET_RISK_CHANGED, { assetId });
        } catch (err) {
          this.logger.warn(
            `risk recompute failed for asset ${assetId}: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `risk recompute pass failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  private async warnIfObservationVolumeExceeded(scanJobId: string): Promise<void> {
    try {
      const count = await this.prisma.assetObservation.count({ where: { scanJobId } });
      if (count > OBSERVATION_WARN_THRESHOLD) {
        this.logger.warn(
          `scanJob=${scanJobId} crossed observation volume threshold: ${count} > ${OBSERVATION_WARN_THRESHOLD} (spec §4.4 — continuing to write, no drop)`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `observation volume check failed for scanJob=${scanJobId}: ${err instanceof Error ? err.message : String(err)}`,
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
      // P2002 (unique constraint) can occur when concurrent workers race on the
      // same asset. Retry once so the loser can fall back to the update branch.
      if ((err as { code?: string }).code === 'P2002') {
        return await fn();
      }
      throw err;
    }
  }

  private async fetchRaw(key: string): Promise<Buffer> {
    const obj = await this.storage.getObject('raw-outputs', key);
    return streamToBuffer(obj.body, MAX_RAW_OUTPUT_BYTES);
  }

  private async persist(
    payload: ParseJobPayload,
    out: NormalizedOutput,
  ): Promise<Omit<ParseJobResult, 'correlatedFindings'>> {
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
      const id = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          const upsertedId = await this.assetPersister.upsert(
            payload.engagementId,
            asset,
            probe,
            tx,
          );
          if (!upsertedId) return null;
          await writeObservation(tx, {
            assetId: upsertedId,
            scanJobId: payload.scanJobId,
            scannerName: payload.scannerName,
            kind: 'DISCOVERED',
            payload: { assetValue: asset.value, assetType: asset.type },
          });
          if (
            probe &&
            (probe.status !== undefined || probe.title !== undefined || probe.server !== undefined)
          ) {
            await writeObservation(tx, {
              assetId: upsertedId,
              scanJobId: payload.scanJobId,
              scannerName: payload.scannerName,
              kind: 'HTTP_PROBED',
              payload: { status: probe.status, title: probe.title, server: probe.server },
            });
          }
          return upsertedId;
        }),
      );
      if (!id) continue;
      assetIdByValue.set(asset.value.toLowerCase(), id);
      assetsPersisted++;
      this.publish(payload.engagementId, EngagementUpdateKind.ASSET_ADDED, { assetId: id });
      this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, { assetId: id });
    }

    // IP assets: IpAddressPersister owns the IpAddress row + Asset pivot.
    // Processed before ports so that assetIdByValue is fully populated when
    // portPersister resolves IP assetValues (e.g. nmap emits IP + ports together).
    const ipAssetIdByValue = new Map<string, string>();
    let ipAddressesPersisted = 0;
    for (const asset of out.assets) {
      if (asset.type !== 'IP') continue;
      const id = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          const upsertedId = await this.ipAddressPersister.upsert(payload.engagementId, asset, tx);
          if (!upsertedId) return null;
          await writeObservation(tx, {
            assetId: upsertedId,
            scanJobId: payload.scanJobId,
            scannerName: payload.scannerName,
            kind: 'DISCOVERED',
            payload: { assetValue: asset.value, assetType: 'IP' },
          });
          return upsertedId;
        }),
      );
      if (!id) continue;
      const canonicalIpKey = canonicalize(asset.value, { type: 'IP_ADDRESS' });
      ipAssetIdByValue.set(canonicalIpKey, id);
      // Merge into assetIdByValue so ports/services can resolve the IP's Asset id.
      assetIdByValue.set(asset.value.toLowerCase(), id);
      ipAddressesPersisted++;
      this.publish(payload.engagementId, EngagementUpdateKind.ASSET_ADDED, { assetId: id });
      this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, { assetId: id });
    }

    const portIdByKey = new Map<string, string>();
    let portsPersisted = 0;
    for (const port of out.ports) {
      const assetId = assetIdByValue.get(port.assetValue.toLowerCase());
      if (!assetId) continue;
      const id = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          const portId = await this.portPersister.upsert(assetId, port, tx);
          await writeObservation(tx, {
            assetId,
            scanJobId: payload.scanJobId,
            scannerName: payload.scannerName,
            kind: 'PORT_OPEN',
            payload: { number: port.number, protocol: port.protocol, state: port.state },
          });
          await recomputeRiskScoreForAsset(tx, assetId);
          return portId;
        }),
      );
      portIdByKey.set(portKey(port), id);
      portsPersisted++;
      this.publish(payload.engagementId, EngagementUpdateKind.ASSET_RISK_CHANGED, { assetId });
      this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, { assetId });
    }

    let servicesPersisted = 0;
    for (const svc of out.services) {
      const portId = portIdByKey.get(
        portKey({ assetValue: svc.assetValue, number: svc.portNumber, protocol: svc.protocol }),
      );
      if (!portId) continue;
      const svcAssetId = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          await this.servicePersister.upsert(portId, svc, tx);
          const port = await tx.port.findUnique({
            where: { id: portId },
            select: { assetId: true },
          });
          if (port) {
            await writeObservation(tx, {
              assetId: port.assetId,
              scanJobId: payload.scanJobId,
              scannerName: payload.scannerName,
              kind: 'SERVICE_DETECTED',
              payload: {
                portNumber: svc.portNumber,
                protocol: svc.protocol,
                name: svc.name,
                product: svc.product,
                version: svc.version,
              },
            });
            await recomputeRiskScoreForAsset(tx, port.assetId);
            return port.assetId;
          }
          return null;
        }),
      );
      servicesPersisted++;
      if (svcAssetId) {
        this.publish(payload.engagementId, EngagementUpdateKind.ASSET_RISK_CHANGED, {
          assetId: svcAssetId,
        });
        this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, {
          assetId: svcAssetId,
        });
      }
    }

    let technologiesPersisted = 0;
    for (const tech of out.technologies) {
      const assetId = assetIdByValue.get(tech.assetValue.toLowerCase());
      if (!assetId) continue;
      await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          await this.technologyPersister.upsert(assetId, tech, payload.scannerName, tx);
          await writeObservation(tx, {
            assetId,
            scanJobId: payload.scanJobId,
            scannerName: payload.scannerName,
            kind: 'TECH_DETECTED',
            payload: { name: tech.name, version: tech.version, categories: tech.categories },
          });
        }),
      );
      technologiesPersisted++;
      this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, { assetId });
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
          await writeObservation(tx, {
            assetId: assetId!,
            scanJobId: payload.scanJobId,
            scannerName: payload.scannerName,
            kind: 'FINDING_RAISED',
            payload: {
              title: finding.title,
              severity: finding.severity,
              cveId: finding.cveId,
              templateId: finding.templateId,
              location: finding.location,
            },
          });
          await recomputeRiskScoreForAsset(tx, assetId!);
        }),
      );
      findingsPersisted++;
      this.publish(payload.engagementId, EngagementUpdateKind.FINDING_RAISED, { assetId });
      this.publish(payload.engagementId, EngagementUpdateKind.ASSET_RISK_CHANGED, { assetId });
      this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, { assetId });
    }

    // DNS records: look up Subdomain/Domain and create DnsRecord rows.
    let dnsRecordsPersisted = 0;
    for (const record of out.dnsRecords) {
      await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          await this.dnsRecordPersister.upsert(payload.engagementId, record, tx);
          const canonicalHost = canonicalize(record.assetValue, { type: 'SUBDOMAIN' });
          let observationAssetId = assetIdByValue.get(canonicalHost);
          if (!observationAssetId) {
            const fallback = await tx.asset.findFirst({
              where: {
                engagementId: payload.engagementId,
                canonicalValue: canonicalHost,
                deletedAt: null,
              },
              select: { id: true },
            });
            observationAssetId = fallback?.id;
          }
          if (observationAssetId) {
            await writeObservation(tx, {
              assetId: observationAssetId,
              scanJobId: payload.scanJobId,
              scannerName: payload.scannerName,
              kind: 'DNS_RECORD',
              payload: {
                recordType: record.recordType,
                name: record.assetValue,
                value: record.value,
                ttl: record.ttl,
              },
            });
          }
        }),
      );
      dnsRecordsPersisted++;
    }

    // SubdomainIp joins: for each A/AAAA record whose host is a known Subdomain
    // and whose IP was just persisted, create the join row.
    let subdomainIpsPersisted = 0;
    for (const record of out.dnsRecords) {
      if (record.recordType !== 'A' && record.recordType !== 'AAAA') continue;
      const canonicalIp = canonicalize(record.value, { type: 'IP_ADDRESS' });
      if (!ipAssetIdByValue.has(canonicalIp)) continue;

      const canonicalHost = canonicalize(record.assetValue, { type: 'SUBDOMAIN' });

      await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          const subdomain = await tx.subdomain.findFirst({
            where: { engagementId: payload.engagementId, canonicalValue: canonicalHost },
            select: { id: true },
          });
          if (!subdomain) return;

          const ipAddress = await tx.ipAddress.findFirst({
            where: { engagementId: payload.engagementId, canonicalValue: canonicalIp },
            select: { id: true },
          });
          if (!ipAddress) return;

          await this.subdomainIpPersister.upsert(subdomain.id, ipAddress.id, tx);

          const subdomainAssetId = assetIdByValue.get(canonicalHost);
          if (subdomainAssetId) {
            await writeObservation(tx, {
              assetId: subdomainAssetId,
              scanJobId: payload.scanJobId,
              scannerName: payload.scannerName,
              kind: 'RESOLVED',
              payload: { ip: canonicalIp },
            });
          }
        }),
      );
      subdomainIpsPersisted++;
    }

    // Endpoints: persisted after subdomain/IP rows exist so that host-linking
    // (subdomainId resolution inside EndpointPersister) finds the Subdomain row.
    let endpointsPersisted = 0;
    if (out.endpoints?.length > 0) {
      endpointsPersisted = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction(async (tx) => {
          return this.endpointPersister.upsert(
            out.endpoints,
            {
              scanJobId: payload.scanJobId,
              scannerName: payload.scannerName,
              target: payload.target,
              engagementId: payload.engagementId,
            },
            tx,
          );
        }),
      );
    }

    // OSINT entities (emails / org metadata) — independent of host linking.
    const ctx = {
      scanJobId: payload.scanJobId,
      scannerName: payload.scannerName,
      target: payload.target,
      engagementId: payload.engagementId,
    };
    let emailsPersisted = 0;
    if (out.emails?.length > 0) {
      emailsPersisted = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction((tx) => this.emailPersister.upsert(out.emails, ctx, tx)),
      );
    }
    let orgMetadataPersisted = 0;
    if (out.orgMetadata?.length > 0) {
      orgMetadataPersisted = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction((tx) =>
          this.orgMetadataPersister.upsert(out.orgMetadata, ctx, tx),
        ),
      );
    }
    let tlsCertificatesPersisted = 0;
    if (out.tlsCertificates?.length > 0) {
      tlsCertificatesPersisted = await this.withRetryOnSerializationConflict(() =>
        this.prisma.$transaction((tx) =>
          this.tlsCertificatePersister.upsert(out.tlsCertificates, ctx, tx),
        ),
      );
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
      endpointsPersisted,
      emailsPersisted,
      orgMetadataPersisted,
      tlsCertificatesPersisted,
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

// Spec §4.4: WARN — but continue writing — when AssetObservation rows for a
// single scanJob exceed this threshold. Large nuclei runs can plausibly hit it;
// the warn surfaces volume pressure without dropping observations.
export const OBSERVATION_WARN_THRESHOLD = 10_000;

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
