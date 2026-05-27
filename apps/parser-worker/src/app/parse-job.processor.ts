import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { Job } from 'bullmq';
import {
  ParserRegistry,
  type NormalizedHttpProbe,
  type NormalizedOutput,
} from '@autoscanner/parsers';
import { QueueName, type ParseJobPayload } from '@autoscanner/queues';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';

import { CorrelationService } from './correlation.service';
import { AssetPersister } from './persisters/asset-persister';
import { FindingPersister } from './persisters/finding-persister';
import { PortPersister } from './persisters/port-persister';
import { ServicePersister } from './persisters/service-persister';
import { TechnologyPersister } from './persisters/technology-persister';

export interface ParseJobResult {
  assetsPersisted: number;
  portsPersisted: number;
  servicesPersisted: number;
  findingsPersisted: number;
  technologiesPersisted: number;
}

@Processor(QueueName.PARSE_JOBS, { concurrency: 4 })
export class ParseJobProcessor extends WorkerHost {
  private readonly logger = new Logger(ParseJobProcessor.name);

  constructor(
    private readonly registry: ParserRegistry,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly correlation: CorrelationService,
    private readonly assetPersister: AssetPersister,
    private readonly portPersister: PortPersister,
    private readonly servicePersister: ServicePersister,
    private readonly technologyPersister: TechnologyPersister,
    private readonly findingPersister: FindingPersister,
  ) {
    super();
  }

  async process(job: Job<ParseJobPayload>): Promise<ParseJobResult> {
    const payload = job.data;
    this.logger.log(
      `Processing parseJob scanJob=${payload.scanJobId} parser=${payload.parserName}`,
    );

    const parser = this.registry.get(payload.parserName);

    const raw = await this.fetchRaw(payload.rawOutputKey);
    if (!raw.length) {
      throw new Error(`raw output at ${payload.rawOutputKey} is empty`);
    }

    const output = await parser.parse(raw, {
      scanJobId: payload.scanJobId,
      scannerName: payload.scannerName,
      target: payload.target,
      engagementId: payload.engagementId,
    });

    const result = await this.persist(payload, output);
    this.logger.log(
      `parseJob scanJob=${payload.scanJobId} assets=${result.assetsPersisted} ports=${result.portsPersisted} services=${result.servicesPersisted} findings=${result.findingsPersisted} technologies=${result.technologiesPersisted}`,
    );

    // Correlation v1: defensive merge of duplicate subdomains within the engagement.
    // Best-effort — persistence already succeeded, so the BullMQ job reports success
    // even if correlation fails. The unique constraint on Subdomain prevents the
    // duplicates this targets today; it will become load-bearing in Phase 3+.
    try {
      const { merged } = await this.correlation.mergeSubdomains(payload.engagementId);
      if (merged > 0) {
        this.logger.log(
          `correlation merged ${merged} duplicate subdomains for engagement ${payload.engagementId}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `correlation failed for engagement ${payload.engagementId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    return result;
  }

  private async fetchRaw(key: string): Promise<Buffer> {
    const obj = await this.storage.getObject('raw-outputs', key);
    return streamToBuffer(obj.body);
  }

  private async persist(payload: ParseJobPayload, out: NormalizedOutput): Promise<ParseJobResult> {
    const assetIdByValue = new Map<string, string>();
    let assetsPersisted = 0;

    // Index HTTP probes by canonical assetValue so SUBDOMAIN upserts can
    // atomically update Subdomain.httpStatus/httpTitle/httpServer inside the
    // same transaction as the Domain/Subdomain/Asset upserts.
    const httpProbeByValue = new Map<string, NormalizedHttpProbe>();
    for (const probe of out.httpProbes) {
      httpProbeByValue.set(probe.assetValue.toLowerCase(), probe);
    }

    for (const asset of out.assets) {
      const probe = httpProbeByValue.get(asset.value.toLowerCase());
      const id = await this.assetPersister.upsert(payload.engagementId, asset, probe);
      if (!id) continue;
      assetIdByValue.set(asset.value.toLowerCase(), id);
      assetsPersisted++;
    }

    const portIdByKey = new Map<string, string>();
    let portsPersisted = 0;
    for (const port of out.ports) {
      const assetId = assetIdByValue.get(port.assetValue.toLowerCase());
      if (!assetId) continue;
      const id = await this.portPersister.upsert(assetId, port);
      portIdByKey.set(portKey(port), id);
      portsPersisted++;
    }

    let servicesPersisted = 0;
    for (const svc of out.services) {
      const portId = portIdByKey.get(
        portKey({ assetValue: svc.assetValue, number: svc.portNumber, protocol: svc.protocol }),
      );
      if (!portId) continue;
      await this.servicePersister.upsert(portId, svc);
      servicesPersisted++;
    }

    let technologiesPersisted = 0;
    for (const tech of out.technologies) {
      const assetId = assetIdByValue.get(tech.assetValue.toLowerCase());
      if (!assetId) continue;
      await this.technologyPersister.upsert(assetId, tech, payload.scannerName);
      technologiesPersisted++;
    }

    let findingsPersisted = 0;
    for (const finding of out.findings) {
      const assetId = findFirstAssetId(assetIdByValue);
      if (!assetId) continue;
      await this.findingPersister.upsert(payload.scanJobId, assetId, finding);
      findingsPersisted++;
    }

    return {
      assetsPersisted,
      portsPersisted,
      servicesPersisted,
      findingsPersisted,
      technologiesPersisted,
    };
  }
}

function portKey(p: { assetValue: string; number: number; protocol: string }): string {
  return `${p.assetValue.toLowerCase()}|${p.number}|${p.protocol}`;
}

function findFirstAssetId(map: Map<string, string>): string | undefined {
  for (const id of map.values()) return id;
  return undefined;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
