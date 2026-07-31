import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { WebhookJobPayload } from '@autoscanner/queues';
import { canonicalize } from '@autoscanner/correlation';
import { ConsumerRegistrar, MessageConsumer, type MessageContext } from '@autoscanner/messaging';

import { FindingPersister } from '../persisters/finding-persister';
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
    private readonly findingPersister: FindingPersister,
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

    for (const finding of batch.findings) {
      const { assetValue } = finding;

      // Determine asset type
      const type = IPV4_RE.test(assetValue) ? 'IP_ADDRESS' : 'DOMAIN';
      const canonicalValue = canonicalize(assetValue, { type });

      // Find-or-create the Asset
      let asset = await this.prisma.asset.findFirst({
        where: {
          engagementId: batch.engagementId,
          type,
          canonicalValue,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!asset) {
        asset = await this.prisma.asset.create({
          data: {
            engagementId: batch.engagementId,
            type,
            value: assetValue,
            canonicalValue,
          },
          select: { id: true },
        });
      }

      // Persist the finding via FindingPersister (handles dedup hash)
      await this.findingPersister.upsert(
        scanJob.id,
        asset.id,
        {
          scannerName: finding.scannerName,
          title: finding.title,
          severity: finding.severity,
          location: finding.location,
          cveId: finding.cveId,
          evidence: finding.evidence,
        },
        canonicalValue,
      );

      findingsPersisted++;
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
