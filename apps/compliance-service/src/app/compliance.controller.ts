import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';

import { ComplianceService, type FindingCreatedEvent } from './compliance.service';

/** Internal API — reached by other services over the private network, not exposed publicly. */
@Controller()
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('health')
  @HttpCode(200)
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('internal/compliance/map')
  map(@Body() body: FindingCreatedEvent): Promise<{ mappings: number }> {
    return this.compliance.map(body);
  }

  @Get('internal/compliance')
  list(@Query('engagementId') engagementId: string) {
    return this.compliance.listForEngagement(engagementId);
  }
}
