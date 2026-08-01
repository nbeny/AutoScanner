import { Controller, Get, HttpCode, Query } from '@nestjs/common';

import { ThreatIntelService } from './threat-intel.service';

/** Internal API — reached by other services over the private network, not exposed publicly. */
@Controller()
export class ThreatIntelController {
  constructor(private readonly threatIntel: ThreatIntelService) {}

  @Get('health')
  @HttpCode(200)
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('internal/threat-intel')
  list(@Query('engagementId') engagementId: string) {
    return this.threatIntel.listForEngagement(engagementId);
  }
}
