import { Body, Controller, Headers, HttpCode, Ip, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';

import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
@UseGuards(ThrottlerGuard)
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Post(':source')
  @HttpCode(202)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async ingest(
    @Param('source') source: string,
    @Headers('x-autoscanner-token') token: string,
    @Body() body: unknown,
    @Ip() ip: string,
  ): Promise<{ accepted: true; webhookEventId: string }> {
    this.svc.verifyToken(source, token);
    const { webhookEventId } = await this.svc.ingest(source, body, ip);
    return { accepted: true, webhookEventId };
  }
}
