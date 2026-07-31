import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
