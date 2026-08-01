import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@autoscanner/database';
import { writeObservation } from '@autoscanner/correlation';
import { RiskClient } from '@autoscanner/service-clients';
import type { ParseBatchRequest, ParseBatchResponse } from '@autoscanner/service-clients';

import { AssetPersister } from './persisters/asset-persister';
import { PortPersister } from './persisters/port-persister';
import { ServicePersister } from './persisters/service-persister';
import { TechnologyPersister } from './persisters/technology-persister';

const portKey = (assetValue: string, number: number, protocol: string): string =>
  `${assetValue.toLowerCase()}|${number}|${protocol}`;

/**
 * Persists one parser batch's asset-side entities.
 *
 * Assets, ports, services, technologies and their observations run in a SINGLE
 * `prisma.$transaction`. Before the split these were several per-entity transactions inside
 * parser-worker; folding them into one keeps the asset graph internally consistent, which is
 * what the service boundary would otherwise have broken.
 *
 * The risk-score recompute is NO LONGER inside that transaction (SP2b): `Asset.riskScore` is
 * risk-engine's to write. After the batch commits we ask risk-engine to recompute the touched
 * assets, best-effort — at batch time an asset usually has no correlated clusters yet, so the
 * authoritative score comes from the post-correlate recompute anyway; this call just keeps
 * port-only assets (no findings) scored.
 *
 * Findings are NOT written here either — the caller attaches them via finding-service using the
 * `assetIdsByCanonicalValue` map this returns, instead of re-querying per finding.
 */
@Injectable()
export class ParseBatchService {
  private readonly logger = new Logger(ParseBatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assetPersister: AssetPersister,
    private readonly portPersister: PortPersister,
    private readonly servicePersister: ServicePersister,
    private readonly technologyPersister: TechnologyPersister,
    private readonly riskClient: RiskClient,
  ) {}

  async persist(req: ParseBatchRequest): Promise<ParseBatchResponse> {
    const { engagementId, scanJobId, scannerName } = req;

    const { touchedAssetIds, ...response } = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const assetIdByValue = new Map<string, string>();
        const assetIdsByCanonicalValue: Record<string, string> = {};
        const touchedAssetIds = new Set<string>();
        let assetsPersisted = 0;
        let observationsPersisted = 0;

        // --- assets -------------------------------------------------------------
        for (const asset of req.assets) {
          const id = await this.assetPersister.upsert(
            engagementId,
            asset as never,
            asset.httpProbe as never,
            tx,
          );
          if (!id) continue;
          assetIdByValue.set(asset.value.toLowerCase(), id);
          assetIdsByCanonicalValue[asset.value.toLowerCase()] = id;
          touchedAssetIds.add(id);
          assetsPersisted++;

          await writeObservation(tx, {
            assetId: id,
            scanJobId,
            scannerName,
            kind: 'DISCOVERED',
            payload: { type: asset.type, value: asset.value },
          });
          observationsPersisted++;

          if (asset.httpProbe) {
            await writeObservation(tx, {
              assetId: id,
              scanJobId,
              scannerName,
              kind: 'HTTP_PROBED',
              payload: asset.httpProbe as Prisma.InputJsonValue,
            });
            observationsPersisted++;
          }
        }

        // --- ports --------------------------------------------------------------
        const portIdByKey = new Map<string, string>();
        let portsPersisted = 0;
        for (const port of req.ports as Array<Record<string, unknown>>) {
          const assetValue = String(port['assetValue'] ?? '');
          const assetId = assetIdByValue.get(assetValue.toLowerCase());
          if (!assetId) continue;

          const portId = await this.portPersister.upsert(assetId, port as never, tx);
          portIdByKey.set(
            portKey(assetValue, Number(port['number']), String(port['protocol'])),
            portId,
          );
          touchedAssetIds.add(assetId);
          portsPersisted++;

          await writeObservation(tx, {
            assetId,
            scanJobId,
            scannerName,
            kind: 'PORT_OPEN',
            payload: {
              number: port['number'],
              protocol: port['protocol'],
              state: port['state'],
            } as Prisma.InputJsonValue,
          });
          observationsPersisted++;
        }

        // --- services -----------------------------------------------------------
        let servicesPersisted = 0;
        for (const svc of req.services as Array<Record<string, unknown>>) {
          const key = portKey(
            String(svc['assetValue'] ?? ''),
            Number(svc['portNumber']),
            String(svc['protocol']),
          );
          const portId = portIdByKey.get(key);
          if (!portId) continue;

          await this.servicePersister.upsert(portId, svc as never, tx);
          servicesPersisted++;

          const port = await tx.port.findUnique({
            where: { id: portId },
            select: { assetId: true },
          });
          if (port) {
            touchedAssetIds.add(port.assetId);
            await writeObservation(tx, {
              assetId: port.assetId,
              scanJobId,
              scannerName,
              kind: 'SERVICE_DETECTED',
              payload: {
                portNumber: svc['portNumber'],
                protocol: svc['protocol'],
                name: svc['name'],
                product: svc['product'],
                version: svc['version'],
              } as Prisma.InputJsonValue,
            });
            observationsPersisted++;
          }
        }

        // --- technologies -------------------------------------------------------
        let technologiesPersisted = 0;
        for (const tech of req.technologies as Array<Record<string, unknown>>) {
          const assetId = assetIdByValue.get(String(tech['assetValue'] ?? '').toLowerCase());
          if (!assetId) continue;

          await this.technologyPersister.upsert(assetId, tech as never, scannerName, tx);
          touchedAssetIds.add(assetId);
          technologiesPersisted++;

          await writeObservation(tx, {
            assetId,
            scanJobId,
            scannerName,
            kind: 'TECH_DETECTED',
            payload: { name: tech['name'], version: tech['version'] } as Prisma.InputJsonValue,
          });
          observationsPersisted++;
        }

        // --- observations produced by discovery-side work -----------------------
        // AssetObservation is asset-owned, so DNS-record and subdomain<->IP observations are
        // written here rather than by discovery-service, keeping a single writer per table.
        for (const obs of req.extraObservations ?? []) {
          // Callers that already hold the id (finding-service) pass it directly; parser-side
          // entities are still resolved through the canonical-value map built above.
          const assetId = obs.assetId ?? assetIdByValue.get((obs.assetValue ?? '').toLowerCase());
          if (!assetId) continue;
          await writeObservation(tx, {
            assetId,
            scanJobId,
            scannerName,
            kind: obs.kind as never,
            payload: (obs.payload ?? {}) as Prisma.InputJsonValue,
          });
          observationsPersisted++;
        }

        return {
          assetIdsByCanonicalValue,
          assetsPersisted,
          portsPersisted,
          servicesPersisted,
          technologiesPersisted,
          observationsPersisted,
          touchedAssetIds: [...touchedAssetIds],
        };
      },
    );

    // Risk recompute lives outside the transaction now: Asset.riskScore is risk-engine's.
    // Best-effort — a risk outage must not fail an asset batch that already committed.
    if (touchedAssetIds.length > 0) {
      try {
        await this.riskClient.recomputeBatch(touchedAssetIds);
      } catch (err) {
        this.logger.warn(
          `risk recompute failed for ${touchedAssetIds.length} asset(s) in engagement ${engagementId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return response;
  }
}
