import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { RiskService } from './risk.service';

/** Internal API — reached by other services over the private network, not exposed publicly. */
@Controller()
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get('health')
  @HttpCode(200)
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Post('internal/risk/recompute')
  recompute(@Body() body: { assetId: string }): Promise<{ assetId: string; riskScore: number }> {
    return this.risk.recompute(body.assetId);
  }

  @Post('internal/risk/recompute-batch')
  recomputeBatch(@Body() body: { assetIds: string[] }): Promise<{ recomputed: number }> {
    return this.risk.recomputeBatch(body.assetIds ?? []);
  }
}
