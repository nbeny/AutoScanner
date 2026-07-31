import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { recomputeRiskScoreForAsset } from '@autoscanner/correlation';

/**
 * `Asset.riskScore` is asset-service state. cve-enricher-worker used to call
 * `recomputeRiskScoreForAsset` directly, making it a second writer of the column; it now
 * goes through this service instead.
 */
@Injectable()
export class RiskService {
  constructor(private readonly prisma: PrismaService) {}

  async recompute(assetId: string): Promise<{ assetId: string }> {
    await this.prisma.$transaction(async (tx) => {
      await recomputeRiskScoreForAsset(tx, assetId);
    });
    return { assetId };
  }
}
