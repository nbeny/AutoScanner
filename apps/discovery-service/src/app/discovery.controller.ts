import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { DiscoveryEntityRequest, DiscoveryEntityResponse } from '@autoscanner/service-clients';

import { DiscoveryService } from './discovery.service';

@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('health')
  @HttpCode(200)
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('internal/discovery/entity')
  getOrCreateEntity(@Body() body: DiscoveryEntityRequest): Promise<DiscoveryEntityResponse> {
    return this.discovery.getOrCreateEntity(body);
  }
}
