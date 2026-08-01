import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  ParserRegistry,
  type NormalizedHttpProbe,
  type NormalizedOutput,
} from '@autoscanner/parsers';
import type {
  ParseJobPayload,
  CveEnrichmentPayload,
  CveDiscoveryPayload,
} from '@autoscanner/queues';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import { PrismaService } from '@autoscanner/database';
import { AssetClient, DiscoveryClient } from '@autoscanner/service-clients';
import {
  ConsumerRegistrar,
  JOB_BUS,
  MessageConsumer,
  type JobBus,
  type MessageContext,
} from '@autoscanner/messaging';
import {
  ENGAGEMENT_EVENTS_PUBLISHER,
  EngagementUpdateKind,
  type EngagementEventsPublisher,
} from '@autoscanner/engagement-events';

const PARSE_TOPIC = 'security.parse.requested';
const CVE_ENRICH_TOPIC = 'security.cve.enrich.requested';
const CVE_DISCOVERY_TOPIC = 'security.cve.discovery.requested';

import {
  AssetMergeService,
  CorrelateFindingsService,
  canonicalize,
  writeObservation,
} from '@autoscanner/correlation';
import { Prisma } from '@prisma/client';
import { FindingPersister } from './persisters/finding-persister';

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
  identitiesPersisted: number;
  breachExposuresPersisted: number;
  orgMetadataPersisted: number;
  tlsCertificatesPersisted: number;
  correlatedFindings: number;
}

@Injectable()
export class ParseJobProcessor
  extends MessageConsumer<ParseJobPayload>
  implements OnApplicationBootstrap
{
  readonly topic = PARSE_TOPIC;
  private readonly logger = new Logger(ParseJobProcessor.name);

  constructor(
    private readonly registry: ParserRegistry,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly assetMerge: AssetMergeService,
    private readonly correlateFindings: CorrelateFindingsService,
    private readonly findingPersister: FindingPersister,
    private readonly prisma: PrismaService,
    private readonly assetClient: AssetClient,
    private readonly discoveryClient: DiscoveryClient,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(ENGAGEMENT_EVENTS_PUBLISHER)
    private readonly events: EngagementEventsPublisher,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  private publish(
    engagementId: string,
    kind: EngagementUpdateKind,
    extra: { assetId?: string; severity?: string; title?: string } = {},
  ): void {
    this.events
      .publish({
        kind,
        engagementId,
        assetId: extra.assetId,
        severity: extra.severity,
        title: extra.title,
        ts: new Date().toISOString(),
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Engagement event publish failed (${kind}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  async process(ctx: MessageContext<ParseJobPayload>): Promise<ParseJobResult> {
    const payload = ctx.payload;
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
        await this.bus.publish<CveEnrichmentPayload>(CVE_ENRICH_TOPIC, cveId, { cveId });
      } catch (err) {
        this.logger.warn(
          `CVE_ENRICHMENT enqueue failed for ${cveId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Enqueue CVE_DISCOVERY jobs for each (service, cpe) pair in this engagement.
    // We query by engagement scope (port.asset.engagementId) so any service-with-CPE
    // persisted by earlier parse jobs in the same engagement is also covered. This is
    // intentionally engagement-wide: re-publishing an already-discovered pair is
    // harmless because the discovery consumer is idempotent — it reads the
    // CpeCveCache (keyed by cpe) and upserts findings by (assetId, dedupHash).
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
            await this.bus.publish<CveDiscoveryPayload>(CVE_DISCOVERY_TOPIC, `${svc.id}:${cpe}`, {
              scanJobId: payload.scanJobId,
              engagementId: payload.engagementId,
              assetId,
              assetCanonical,
              serviceId: svc.id,
              cpe,
              location,
              product: svc.product ?? undefined,
              version: svc.version ?? undefined,
            });
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
    // Subdomain/IpAddress dedup is discovery-row hygiene and now runs in discovery-service,
    // which owns those rows (and can repoint the Asset pivot FKs atomically with the delete).
    await this.runMergePass('subdomains', () =>
      this.discoveryClient.mergeSubdomains(payload.engagementId),
    );
    await this.runMergePass('IpAddress rows', () =>
      this.discoveryClient.mergeIpAddresses(payload.engagementId),
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
      `parseJob scanJob=${payload.scanJobId} assets=${finalResult.assetsPersisted} ports=${finalResult.portsPersisted} services=${finalResult.servicesPersisted} findings=${finalResult.findingsPersisted} technologies=${finalResult.technologiesPersisted} ipAddresses=${finalResult.ipAddressesPersisted} dnsRecords=${finalResult.dnsRecordsPersisted} subdomainIps=${finalResult.subdomainIpsPersisted} endpoints=${finalResult.endpointsPersisted} emails=${finalResult.emailsPersisted} identities=${finalResult.identitiesPersisted} breachExposures=${finalResult.breachExposuresPersisted} orgMetadata=${finalResult.orgMetadataPersisted} tlsCertificates=${finalResult.tlsCertificatesPersisted} correlatedFindings=${finalResult.correlatedFindings}`,
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
          // Asset.riskScore is asset-service state — recompute through the service so the
          // column keeps a single writer.
          await this.assetClient.recomputeRisk(assetId);
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
    // SP1a: asset- and discovery-side entities are no longer persisted here. They go as
    // batches to their owning services, each applying its batch in one transaction. What
    // stays local is Findings (they move in SP2) — they attach using the asset id map the
    // asset batch returns, which replaces the old per-finding DB lookup.
    const httpProbeByValue = new Map<string, NormalizedHttpProbe>();
    for (const probe of out.httpProbes) {
      httpProbeByValue.set(probe.assetValue.toLowerCase(), probe);
    }

    const assetBatch = await this.assetClient.parseBatch({
      engagementId: payload.engagementId,
      scanJobId: payload.scanJobId,
      scannerName: payload.scannerName,
      assets: out.assets.map((a) => ({
        type: a.type,
        value: a.value,
        httpProbe: httpProbeByValue.get(a.value.toLowerCase()) as
          | Record<string, unknown>
          | undefined,
      })),
      ports: out.ports as unknown as Array<Record<string, unknown>>,
      services: out.services as unknown as Array<Record<string, unknown>>,
      technologies: out.technologies as unknown as Array<Record<string, unknown>>,
    });

    const assetIdByValue = new Map<string, string>(
      Object.entries(assetBatch.assetIdsByCanonicalValue),
    );
    for (const assetId of new Set(assetIdByValue.values())) {
      this.publish(payload.engagementId, EngagementUpdateKind.ASSET_ADDED, { assetId });
      this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, { assetId });
    }

    // Subdomain <-> IP links come from A/AAAA records; discovery-service resolves both
    // sides and skips pairs whose rows do not exist.
    const subdomainIpLinks = out.dnsRecords
      .filter((r) => r.recordType === 'A' || r.recordType === 'AAAA')
      .map((r) => ({
        canonicalHost: canonicalize(r.assetValue, { type: 'SUBDOMAIN' }),
        canonicalIp: canonicalize(r.value, { type: 'IP_ADDRESS' }),
      }));

    const discoveryBatch = await this.discoveryClient.parseBatch({
      engagementId: payload.engagementId,
      scanJobId: payload.scanJobId,
      scannerName: payload.scannerName,
      target: payload.target,
      dnsRecords: out.dnsRecords as unknown as Array<Record<string, unknown>>,
      endpoints: out.endpoints as unknown as Array<Record<string, unknown>>,
      emails: out.emails as unknown as Array<Record<string, unknown>>,
      identities: out.identities as unknown as Array<Record<string, unknown>>,
      breachExposures: out.breachExposures as unknown as Array<Record<string, unknown>>,
      orgMetadata: out.orgMetadata as unknown as Array<Record<string, unknown>>,
      tlsCertificates: out.tlsCertificates as unknown as Array<Record<string, unknown>>,
      subdomainIpLinks,
    });

    // AssetObservation is asset-owned, so the rows the pre-split parser wrote for DNS
    // records and subdomain<->IP links go back through asset-service rather than being
    // written here (or silently dropped).
    const extraObservations = [
      ...out.dnsRecords.map((r) => ({
        assetValue: canonicalize(r.assetValue, { type: 'SUBDOMAIN' }),
        kind: 'DNS_RECORD',
        payload: { recordType: r.recordType, value: r.value } as Record<string, unknown>,
      })),
      ...discoveryBatch.linkedHosts.map((host: string) => ({
        assetValue: host,
        kind: 'DNS_RECORD',
        payload: { link: 'subdomain-ip' } as Record<string, unknown>,
      })),
    ];
    if (extraObservations.length > 0) {
      await this.assetClient.parseBatch({
        engagementId: payload.engagementId,
        scanJobId: payload.scanJobId,
        scannerName: payload.scannerName,
        assets: [],
        ports: [],
        services: [],
        technologies: [],
        extraObservations,
      });
    }

    // --- Findings (still owned by parser-worker until SP2) ---------------------
    let findingsPersisted = 0;
    for (const finding of out.findings) {
      // Resolution order: the id map returned by the asset batch, then a DB lookup for
      // assets persisted by an earlier parse job in this engagement. No "pick any asset"
      // fallback: mis-attributing a finding corrupts per-asset rollups downstream.
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
        }),
      );
      findingsPersisted++;
      this.publish(payload.engagementId, EngagementUpdateKind.FINDING_RAISED, {
        assetId,
        severity: finding.severity,
        title: finding.title,
      });
      this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, { assetId });
      // A new finding changes the risk score, which is asset-service state.
      await this.assetClient.recomputeRisk(assetId);
      this.publish(payload.engagementId, EngagementUpdateKind.ASSET_RISK_CHANGED, { assetId });
    }

    return {
      assetsPersisted: assetBatch.assetsPersisted,
      portsPersisted: assetBatch.portsPersisted,
      servicesPersisted: assetBatch.servicesPersisted,
      findingsPersisted,
      technologiesPersisted: assetBatch.technologiesPersisted,
      // IP assets are now created by the asset batch like any other type; the separate
      // counter is kept in the result shape for log/API compatibility.
      ipAddressesPersisted: 0,
      dnsRecordsPersisted: discoveryBatch.dnsRecordsPersisted,
      subdomainIpsPersisted: discoveryBatch.subdomainIpsPersisted,
      endpointsPersisted: discoveryBatch.endpointsPersisted,
      emailsPersisted: discoveryBatch.emailsPersisted,
      identitiesPersisted: discoveryBatch.identitiesPersisted,
      breachExposuresPersisted: discoveryBatch.breachExposuresPersisted,
      orgMetadataPersisted: discoveryBatch.orgMetadataPersisted,
      tlsCertificatesPersisted: discoveryBatch.tlsCertificatesPersisted,
    };
  }
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
