import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@autoscanner/database';
import { recomputeRiskScoreForAsset, writeObservation } from '@autoscanner/correlation';
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
 * Everything runs in a SINGLE `prisma.$transaction`: assets, ports, services, technologies,
 * their observations, and the risk-score recompute for every touched asset. Before the split
 * these were several per-entity transactions inside parser-worker; folding them into one
 * keeps the asset graph and its risk score mutually consistent, which is what the service
 * boundary would otherwise have broken.
 *
 * Findings are NOT written here — they stay in parser-worker until SP2. That is why the
 * response carries `assetIdsByCanonicalValue`: the caller attaches findings using these ids
 * instead of re-querying per finding.
 */
@Injectable()
export class ParseBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetPersister: AssetPersister,
    private readonly portPersister: PortPersister,
    private readonly servicePersister: ServicePersister,
    private readonly technologyPersister: TechnologyPersister,
  ) {}

  async persist(req: ParseBatchRequest): Promise<ParseBatchResponse> {
    const { engagementId, scanJobId, scannerName } = req;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

        const port = await tx.port.findUnique({ where: { id: portId }, select: { assetId: true } });
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
        const assetId = assetIdByValue.get(obs.assetValue.toLowerCase());
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

      // --- risk score ---------------------------------------------------------
      for (const assetId of touchedAssetIds) {
        await recomputeRiskScoreForAsset(tx, assetId);
      }

      return {
        assetIdsByCanonicalValue,
        assetsPersisted,
        portsPersisted,
        servicesPersisted,
        technologiesPersisted,
        observationsPersisted,
      };
    });
  }
}
