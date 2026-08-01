import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { WebhookJobPayload } from '@autoscanner/queues';
import { canonicalize } from '@autoscanner/correlation';
import { AssetClient, FindingClient } from '@autoscanner/service-clients';
import type { FindingBatchItem } from '@autoscanner/service-clients';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';

import { normalizeWebhook, WebhookNormalizationError } from './webhook-normalizer';

/** Matches a bare IPv4 address (e.g. "192.168.1.1" or "10.0.0.5"). */
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

export interface WebhookProcessorResult {
  findingsPersisted: number;
}

const WEBHOOK_TOPIC = 'security.webhook.ingest.requested';

@Injectable()
export class WebhookProcessor
  extends MessageConsumer<WebhookJobPayload>
  implements OnApplicationBootstrap
{
  readonly topic = WEBHOOK_TOPIC;
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly findingClient: FindingClient,
    private readonly assetClient: AssetClient,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<WebhookJobPayload>): Promise<WebhookProcessorResult> {
    const { webhookEventId } = ctx.payload;
    const now = new Date();

    // -----------------------------------------------------------------------
    // Step 1: load the WebhookEvent
    // -----------------------------------------------------------------------
    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });

    if (!event) {
      this.logger.warn(`WebhookProcessor: event ${webhookEventId} not found — skipping`);
      return { findingsPersisted: 0 };
    }

    // -----------------------------------------------------------------------
    // Step 2: normalise the payload
    // -----------------------------------------------------------------------
    let batch: ReturnType<typeof normalizeWebhook>;
    try {
      batch = normalizeWebhook(event.source, event.payload);
    } catch (err) {
      const errorMessage =
        err instanceof WebhookNormalizationError
          ? err.message
          : `Unexpected normalisation error: ${String(err)}`;

      this.logger.warn(
        `WebhookProcessor: normalisation failed for event ${webhookEventId}: ${errorMessage}`,
      );

      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { errorMessage, processedAt: now },
      });
      return { findingsPersisted: 0 };
    }

    // -----------------------------------------------------------------------
    // Step 2b: per-event finding-count cap (DoS guard)
    // -----------------------------------------------------------------------
    const MAX_FINDINGS_PER_EVENT = 1000;
    if (batch.findings.length > MAX_FINDINGS_PER_EVENT) {
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          errorMessage: `too many findings: ${batch.findings.length} (max ${MAX_FINDINGS_PER_EVENT})`,
          processedAt: new Date(),
        },
      });
      return { findingsPersisted: 0 };
    }

    // -----------------------------------------------------------------------
    // Step 3: validate the engagement exists
    // -----------------------------------------------------------------------
    // SECURITY (v1 trust model): the webhook token is per-SOURCE, not per-engagement.
    // A holder of WEBHOOK_<SOURCE>_TOKEN can write findings into ANY existing engagement
    // by supplying its id. This assumes a single-tenant deployment where the token is a
    // trusted operator secret. TODO(phase-5 follow-up): per-engagement HMAC tokens for
    // multi-tenant deployments.
    const engagement = await this.prisma.engagement.findUnique({
      where: { id: batch.engagementId },
    });

    if (!engagement) {
      const errorMessage = `unknown engagement: ${batch.engagementId}`;
      this.logger.warn(`WebhookProcessor: ${errorMessage} for event ${webhookEventId}`);

      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { errorMessage, processedAt: now },
      });
      return { findingsPersisted: 0 };
    }

    // -----------------------------------------------------------------------
    // Step 4: create synthetic Scan + ScanJob
    // -----------------------------------------------------------------------
    const scannerName = `webhook:${event.source}`;

    const scan = await this.prisma.scan.create({
      data: {
        engagementId: batch.engagementId,
        createdById: engagement.ownerId,
        name: scannerName,
        status: 'COMPLETED',
        completedAt: now,
      },
      select: { id: true },
    });

    const scanJob = await this.prisma.scanJob.create({
      data: {
        scanId: scan.id,
        scannerName,
        target: event.source,
        input: {},
        status: 'COMPLETED',
        completedAt: now,
      },
      select: { id: true },
    });

    // -----------------------------------------------------------------------
    // Step 5: upsert assets + findings
    // -----------------------------------------------------------------------
    let findingsPersisted = 0;

    // Assets go through asset-service like every other ingest path. Before SP1a this
    // method created Asset rows itself and never created the matching IpAddress row, so an
    // IP finding produced a pivot that violated the polymorphic-FK invariant; delegating
    // fixes that by construction.
    const assetBatch = await this.assetClient.parseBatch({
      engagementId: batch.engagementId,
      scanJobId: scanJob.id,
      scannerName: `webhook:${event.source}`,
      assets: batch.findings.map((f) => ({
        type: IPV4_RE.test(f.assetValue) ? 'IP' : 'DOMAIN',
        value: f.assetValue,
      })),
      ports: [],
      services: [],
      technologies: [],
    });

    // finding-service owns the writes (SP2a). Resolve each finding to the asset id the
    // batch just returned; skip — never mis-attribute — anything asset-service didn't create.
    const batchItems: FindingBatchItem[] = [];
    for (const finding of batch.findings) {
      const { assetValue } = finding;
      const type = IPV4_RE.test(assetValue) ? 'IP_ADDRESS' : 'DOMAIN';
      const canonicalValue = canonicalize(assetValue, { type });

      const assetId = assetBatch.assetIdsByCanonicalValue[canonicalValue];
      if (!assetId) {
        this.logger.warn(
          `WebhookProcessor: asset-service returned no id for ${canonicalValue} — skipping finding`,
        );
        continue;
      }

      batchItems.push({
        assetId,
        assetCanonical: canonicalValue,
        scannerName: finding.scannerName,
        title: finding.title,
        severity: finding.severity,
        location: finding.location,
        cveId: finding.cveId,
        evidence: finding.evidence as Record<string, unknown> | undefined,
      });
    }

    if (batchItems.length > 0) {
      const findingBatch = await this.findingClient.batch({
        engagementId: batch.engagementId,
        scanJobId: scanJob.id,
        scannerName: `webhook:${event.source}`,
        findings: batchItems,
      });
      findingsPersisted = findingBatch.findingsPersisted;

      // FINDING_RAISED observations are asset-service's to write.
      if (findingBatch.observations.length > 0) {
        await this.assetClient.parseBatch({
          engagementId: batch.engagementId,
          scanJobId: scanJob.id,
          scannerName: `webhook:${event.source}`,
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
    }

    // -----------------------------------------------------------------------
    // Step 6: mark the event as processed
    // -----------------------------------------------------------------------
    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processedAt: now, resultingScanId: scan.id },
    });

    this.logger.log(
      `WebhookProcessor: event ${webhookEventId} source=${event.source} findings=${findingsPersisted} scan=${scan.id}`,
    );

    return { findingsPersisted };
  }
}
