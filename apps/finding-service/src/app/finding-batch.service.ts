import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@autoscanner/database';
import { JOB_BUS, type JobBus } from '@autoscanner/messaging';
import type { FindingBatchRequest, FindingBatchResponse } from '@autoscanner/service-clients';

import { FindingPersister } from './persisters/finding-persister';

const FINDING_CREATED_TOPIC = 'security.finding.created';

/**
 * Persists one parse job's findings.
 *
 * The whole batch runs in a single `prisma.$transaction`, so a partially applied batch can
 * never be observed — the same guarantee asset-service and discovery-service give for their
 * own batches.
 *
 * `AssetObservation` is deliberately NOT written here: that table belongs to asset-service.
 * The `FINDING_RAISED` rows the pre-split parser wrote are returned in `observations` so the
 * caller can hand them to asset-service's `extraObservations` channel, keeping one writer per
 * table. (Before SP2a, parser-worker wrote them directly via `writeObservation(tx, …)` inside
 * the finding transaction — a second writer that the SP1 grep missed because it never
 * mentions `prisma.assetObservation`.)
 */
@Injectable()
export class FindingBatchService {
  private readonly logger = new Logger(FindingBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly findings: FindingPersister,
    @Inject(JOB_BUS) private readonly bus: JobBus,
  ) {}

  async persist(req: FindingBatchRequest): Promise<FindingBatchResponse> {
    const { scanJobId } = req;

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const affected = new Set<string>();
      const observations: FindingBatchResponse['observations'] = [];
      let findingsPersisted = 0;

      for (const item of req.findings) {
        const findingId = await this.findings.upsert(
          scanJobId,
          item.assetId,
          {
            scannerName: item.scannerName,
            title: item.title,
            severity: item.severity,
            location: item.location,
            cveId: item.cveId,
            templateId: item.templateId,
            evidence: item.evidence,
          } as never,
          item.assetCanonical,
          tx,
        );
        findingsPersisted++;
        affected.add(item.assetId);

        observations.push({
          assetId: item.assetId,
          findingId,
          kind: 'FINDING_RAISED',
          payload: {
            title: item.title,
            severity: item.severity,
            cveId: item.cveId,
            templateId: item.templateId,
            location: item.location,
          },
        });
      }

      return {
        findingsPersisted,
        affectedAssetIds: [...affected],
        observations,
      };
    });

    // Lifecycle events go out only once the batch is durable. engagementId + findingId are
    // included so downstream consumers (threat-intel, compliance) can key their rows without a
    // lookup (SP2d).
    for (const obs of result.observations) {
      try {
        await this.bus.publish(FINDING_CREATED_TOPIC, obs.assetId, {
          scanJobId,
          engagementId: req.engagementId,
          assetId: obs.assetId,
          findingId: obs.findingId,
          ...obs.payload,
        });
      } catch (err) {
        this.logger.warn(
          `security.finding.created publish failed for asset ${obs.assetId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return result;
  }
}
