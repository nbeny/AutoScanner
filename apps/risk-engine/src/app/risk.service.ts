import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { computeAssetRiskScore } from '@autoscanner/correlation';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';

/**
 * The ONLY writer of `Asset.riskScore` (SP2b).
 *
 * asset-service and the workers used to write the column from several places; they now call
 * this service, so one process owns the value and the `security.risk.*` lifecycle events.
 */
@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_BUS) private readonly bus: JobBus,
  ) {}

  async recompute(assetId: string): Promise<{ assetId: string; riskScore: number }> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, engagementId: true, riskScore: true },
    });
    if (!asset) throw new Error(`Asset not found: ${assetId}`);

    const score = await computeAssetRiskScore(this.prisma, assetId);
    await this.prisma.asset.update({ where: { id: assetId }, data: { riskScore: score } });

    await this.emit('security.risk.calculated', assetId, {
      assetId,
      engagementId: asset.engagementId,
      riskScore: score,
    });
    if (asset.riskScore !== score) {
      await this.emit('security.risk.changed', assetId, {
        assetId,
        engagementId: asset.engagementId,
        from: asset.riskScore,
        to: score,
      });
      if (score >= 8) {
        await this.emit('security.risk.alert', assetId, {
          assetId,
          engagementId: asset.engagementId,
          riskScore: score,
        });
      }
    }
    return { assetId, riskScore: score };
  }

  async recomputeBatch(assetIds: string[]): Promise<{ recomputed: number }> {
    let recomputed = 0;
    for (const id of [...new Set(assetIds)]) {
      try {
        await this.recompute(id);
        recomputed++;
      } catch (err) {
        this.logger.warn(
          `risk recompute failed for ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { recomputed };
  }

  private async emit(topic: string, key: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.bus.publish(topic, key, payload);
    } catch (err) {
      this.logger.warn(
        `${topic} publish failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
