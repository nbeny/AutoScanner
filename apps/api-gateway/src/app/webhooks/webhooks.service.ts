import * as crypto from 'node:crypto';

import {
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@autoscanner/database';
import { AppConfigService } from '@autoscanner/config';
import { QueueName, type WebhookJobPayload } from '@autoscanner/queues';

const SOURCES = ['generic', 'zap', 'burp'] as const;
type WebhookSource = (typeof SOURCES)[number];

const SIZE_LIMIT_BYTES = 5_242_880; // 5 MB

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QueueName.WEBHOOK_JOBS)
    private readonly webhookQueue: Queue<WebhookJobPayload>,
    private readonly cfg: AppConfigService,
  ) {}

  tokenForSource(source: string): string | undefined {
    switch (source as WebhookSource) {
      case 'generic':
        return this.cfg.env.WEBHOOK_GENERIC_TOKEN;
      case 'zap':
        return this.cfg.env.WEBHOOK_ZAP_TOKEN;
      case 'burp':
        return this.cfg.env.WEBHOOK_BURP_TOKEN;
      default:
        return undefined;
    }
  }

  verifyToken(source: string, provided: string): void {
    const configured = this.tokenForSource(source);

    if (!configured) {
      throw new ServiceUnavailableException('webhook source not configured');
    }

    if (!provided) {
      throw new UnauthorizedException('missing token');
    }

    const configuredBuf = Buffer.from(configured, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');

    if (configuredBuf.byteLength !== providedBuf.byteLength) {
      throw new UnauthorizedException('invalid token');
    }

    if (!crypto.timingSafeEqual(configuredBuf, providedBuf)) {
      throw new UnauthorizedException('invalid token');
    }
  }

  async ingest(
    source: string,
    payload: unknown,
    ip: string | undefined,
  ): Promise<{ webhookEventId: string }> {
    if (!(SOURCES as readonly string[]).includes(source)) {
      throw new NotFoundException(`Unknown webhook source: ${source}`);
    }

    const serialized = JSON.stringify(payload ?? {});
    if (Buffer.byteLength(serialized, 'utf8') > SIZE_LIMIT_BYTES) {
      throw new PayloadTooLargeException('webhook payload exceeds 5 MB limit');
    }

    const event = await this.prisma.webhookEvent.create({
      data: {
        source,
        payload: payload as Prisma.InputJsonValue,
        receivedFromIp: ip ?? null,
      },
    });

    try {
      await this.webhookQueue.add('ingest', { webhookEventId: event.id }, { attempts: 3 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to enqueue webhook-job for event=${event.id}: ${message}`);
      await this.prisma.webhookEvent
        .update({
          where: { id: event.id },
          data: { errorMessage: `enqueue failed: ${message}`.slice(0, 500) },
        })
        .catch((updateErr) => {
          const um = updateErr instanceof Error ? updateErr.message : String(updateErr);
          this.logger.warn(`event=${event.id} errorMessage reconciliation failed: ${um}`);
        });
      throw err;
    }

    this.logger.log(`Ingested webhook event=${event.id} source=${source} ip=${ip ?? 'unknown'}`);
    return { webhookEventId: event.id };
  }
}
