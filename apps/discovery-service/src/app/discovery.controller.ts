import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type {
  DiscoveryEntityRequest,
  DiscoveryEntityResponse,
  DiscoveryParseBatchRequest,
  DiscoveryParseBatchResponse,
} from '@autoscanner/service-clients';

import { DiscoveryService } from './discovery.service';
import { DiscoveryBatchService } from './discovery-batch.service';

@Controller()
export class DiscoveryController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly batch: DiscoveryBatchService,
  ) {}

  @Get('health')
  @HttpCode(200)
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('internal/discovery/entity')
  getOrCreateEntity(@Body() body: DiscoveryEntityRequest): Promise<DiscoveryEntityResponse> {
    return this.discovery.getOrCreateEntity(body);
  }

  @Post('internal/discovery/parse-batch')
  persistBatch(@Body() body: DiscoveryParseBatchRequest): Promise<DiscoveryParseBatchResponse> {
    return this.batch.persist(body);
  }
}
