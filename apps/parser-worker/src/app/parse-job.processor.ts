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
import { AssetClient, DiscoveryClient, FindingClient } from '@autoscanner/service-clients';
import type { FindingBatchItem } from '@autoscanner/service-clients';
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

import { canonicalize } from '@autoscanner/correlation';

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
    private readonly prisma: PrismaService,
    private readonly assetClient: AssetClient,
    private readonly discoveryClient: DiscoveryClient,
    private readonly findingClient: FindingClient,
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

    // Enqueue CVE_DISCOVERY jobs for each (service, cpe) pair on the assets THIS job touched
    // (SP2c defect 6). A CPE only appears once its service is (re)persisted, which touches its
    // asset — so scoping to the touched assets covers every newly-discovered pair without
    // re-scanning the whole engagement on every parse job. Re-publishing an already-discovered
    // pair stays harmless: the discovery consumer is idempotent (CpeCveCache keyed by cpe,
    // findings upserted by (assetId, dedupHash)).
    const touchedAssetIds = result.touchedAssetIds;
    if (touchedAssetIds.length > 0) {
      try {
        const cpeServices = await this.prisma.service.findMany({
          where: {
            cpe: { isEmpty: false },
            port: { asset: { engagementId: payload.engagementId, id: { in: touchedAssetIds } } },
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
    }

    // Correlation v1: defensive discovery-row merges. Best-effort — persistence already
    // succeeded, so the job reports success even if a pass fails.
    // Subdomain/IpAddress dedup is discovery-row hygiene and runs in discovery-service, which
    // owns those rows (and can repoint the Asset pivot FKs atomically with the delete).
    // Cross-asset Finding dedup is NO LONGER run per parse job (SP2c defect 6): it is the one
    // genuinely engagement-wide pass, so it moved to the scheduled correlation sweep.
    await this.runMergePass('subdomains', () =>
      this.discoveryClient.mergeSubdomains(payload.engagementId),
    );
    await this.runMergePass('IpAddress rows', () =>
      this.discoveryClient.mergeIpAddresses(payload.engagementId),
    );

    // Correlation v2: structural-hash clustering, scoped to the assets this job touched.
    // Clustering is per-asset, so re-clustering just the touched assets is complete (SP2c
    // defect 6). Best-effort — parse job reports success even if this pass fails.
    let correlatedFindings = 0;
    await this.runCorrelatePass(payload.engagementId, touchedAssetIds, (n) => {
      correlatedFindings = n;
    });

    // Risk-score v2: recompute risk for the touched assets that have findings, AFTER the
    // correlate pass, so computeRiskScore sees the updated clusters (count-once + CVSS).
    // Best-effort — parse job reports success even if this pass fails.
    await this.runRiskRecomputePass(payload.engagementId, touchedAssetIds);

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
    assetIds: string[],
    onSuccess: (clusters: number) => void,
  ): Promise<void> {
    if (assetIds.length === 0) return;
    try {
      const { clusters } = await this.findingClient.correlate(engagementId, assetIds);
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
  private async runRiskRecomputePass(engagementId: string, scopeAssetIds: string[]): Promise<void> {
    if (scopeAssetIds.length === 0) return;
    try {
      // Of the assets this job touched, recompute only those that actually have a finding.
      // We read the findings table rather than correlatedFindings because an asset may have
      // findings that haven't been clustered yet (e.g. if the correlate pass failed) and we
      // still want its score recomputed.
      const assetRows = await this.prisma.finding.findMany({
        where: { asset: { engagementId }, assetId: { in: scopeAssetIds } },
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

  private async fetchRaw(key: string): Promise<Buffer> {
    const obj = await this.storage.getObject('raw-outputs', key);
    return streamToBuffer(obj.body, MAX_RAW_OUTPUT_BYTES);
  }

  private async persist(
    payload: ParseJobPayload,
    out: NormalizedOutput,
  ): Promise<Omit<ParseJobResult, 'correlatedFindings'> & { touchedAssetIds: string[] }> {
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

    // --- Findings ------------------------------------------------------------
    // finding-service owns the writes (SP2a). Resolution order is unchanged: the id map the
    // asset batch returned, then a DB lookup for assets persisted by an earlier parse job.
    // No "pick any asset" fallback — mis-attributing a finding corrupts per-asset rollups.
    const batchItems: FindingBatchItem[] = [];
    for (const finding of out.findings) {
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
      batchItems.push({
        assetId,
        assetCanonical: canonicalHost ?? '',
        scannerName: payload.scannerName,
        title: finding.title,
        severity: finding.severity,
        location: finding.location,
        cveId: finding.cveId,
        templateId: finding.templateId,
        evidence: finding.evidence as Record<string, unknown> | undefined,
      });
    }

    let findingsPersisted = 0;
    if (batchItems.length > 0) {
      const findingBatch = await this.findingClient.batch({
        engagementId: payload.engagementId,
        scanJobId: payload.scanJobId,
        scannerName: payload.scannerName,
        findings: batchItems,
      });
      findingsPersisted = findingBatch.findingsPersisted;

      // FINDING_RAISED observations come back rather than being written by finding-service:
      // AssetObservation belongs to asset-service, so its owner writes them.
      if (findingBatch.observations.length > 0) {
        await this.assetClient.parseBatch({
          engagementId: payload.engagementId,
          scanJobId: payload.scanJobId,
          scannerName: payload.scannerName,
          assets: [],
          ports: [],
          services: [],
          technologies: [],
          extraObservations: findingBatch.observations.map((o) => ({
            assetValue: '',
            assetId: o.assetId,
            kind: o.kind,
            payload: o.payload,
          })) as never,
        });
      }

      for (const item of batchItems) {
        this.publish(payload.engagementId, EngagementUpdateKind.FINDING_RAISED, {
          assetId: item.assetId,
          severity: item.severity,
          title: item.title,
        });
        this.publish(payload.engagementId, EngagementUpdateKind.OBSERVATION_ADDED, {
          assetId: item.assetId,
        });
      }
    }
    // Defect 2 (SP2 spec §2.4.2): the per-finding risk recompute used to run here, uncaught,
    // so a risk-service blip aborted the parse job midway with findings already committed.
    // It is gone — `runRiskRecomputePass` after the correlate pass already recomputes every
    // asset that has findings, and it is best-effort like the other passes.

    // Assets this job actually touched: every asset the asset batch upserted, plus every asset
    // a finding attached to. The engagement-wide passes scope to this set (SP2c defect 6).
    const touched = new Set<string>(assetIdByValue.values());
    for (const item of batchItems) touched.add(item.assetId);

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
      touchedAssetIds: [...touched],
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
