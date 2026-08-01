import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { ParseBatchRequest, ParseBatchResponse } from '@autoscanner/service-clients';

import { ParseBatchService } from './parse-batch.service';
import { RiskService } from './risk.service';

/**
 * Internal API — not exposed publicly. Callers are other services (parser-worker,
 * cve-enricher-worker), which reach it over the private network.
 */
@Controller()
export class AssetController {
  constructor(
    private readonly parseBatch: ParseBatchService,
    private readonly risk: RiskService,
  ) {}

  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Post('internal/assets/parse-batch')
  persistBatch(@Body() body: ParseBatchRequest): Promise<ParseBatchResponse> {
    return this.parseBatch.persist(body);
  }

  @Post('internal/assets/:id/recompute-risk')
  recomputeRisk(@Param('id') id: string): Promise<{ assetId: string }> {
    return this.risk.recompute(id);
  }
}
