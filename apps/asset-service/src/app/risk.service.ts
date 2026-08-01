import { Injectable } from '@nestjs/common';
import { RiskClient } from '@autoscanner/service-clients';

/**
 * Thin proxy to risk-engine, the single writer of `Asset.riskScore` (SP2b).
 *
 * asset-service keeps the `/internal/assets/:id/recompute-risk` route so its callers
 * (parser-worker, cve-discovery via `AssetClient.recomputeRisk`) don't change in lockstep; the
 * actual read-compute-write lives in risk-engine now.
 */
@Injectable()
export class RiskService {
  constructor(private readonly riskClient: RiskClient) {}

  async recompute(assetId: string): Promise<{ assetId: string }> {
    const { assetId: id } = await this.riskClient.recompute(assetId);
    return { assetId: id };
  }
}
