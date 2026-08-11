import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'node:stream';

import { PrismaService } from '@autoscanner/database';
import { OBJECT_STORAGE, type ObjectStorage } from '@autoscanner/storage';
import type { WorldState as ChainWorldState } from '@autoscanner/chain-engine';

/**
 * The distilled, per-target picture of everything run so far in an AI run. After
 * the Kali-as-scanner pivot (SP1) scanners emit raw stdout and produce zero
 * normalised entities/findings, so world-state no longer reads discovery tables.
 * Instead it feeds Claude the **raw output** of the most recent completed scans
 * so it can reason on the actual tool output when deciding what to run next.
 */
export interface WorldState {
  target: string;
  scannersRun: string[];
  recentOutputs: { scanner: string; target: string; excerpt: string }[];
}

/** How many recent completed scan jobs to surface raw output for. */
export const RECENT_OUTPUTS_LIMIT = 6;

/** Per-output byte cap on the raw stdout excerpt injected into the prompt. */
export const RAW_EXCERPT_BYTES = 4096;

/**
 * Read at most `maxBytes` from a storage stream, then stop. Unlike the parser's
 * `streamToBuffer` (which throws on oversize input), this truncates: excerpts are
 * intentionally lossy, so a huge scan output yields the first `maxBytes` bytes
 * and the socket is freed early via `destroy()`.
 */
async function readCapped(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = maxBytes - total;
    if (buf.length >= remaining) {
      chunks.push(buf.subarray(0, remaining));
      stream.destroy();
      break;
    }
    chunks.push(buf);
    total += buf.length;
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class WorldStateService {
  private readonly logger = new Logger(WorldStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * Assemble the {@link WorldState} for one target within an AI run: the distinct
   * scanners already run, plus truncated raw stdout excerpts for the most recent
   * completed scan jobs (downloaded from the `raw-outputs` bucket). Downloads are
   * best-effort — a missing/failed object is skipped, never thrown, so a storage
   * hiccup can't abort the decision loop.
   */
  async build(aiRunId: string, _engagementId: string, target: string): Promise<WorldState> {
    const jobs = await this.prisma.scanJob.findMany({
      where: { scan: { aiRunId } },
      select: {
        scannerName: true,
        target: true,
        status: true,
        rawOutputKey: true,
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const scannersRun = [...new Set(jobs.map((j) => j.scannerName))];

    const recentOutputs: WorldState['recentOutputs'] = [];
    const completed = jobs
      .filter((j) => j.status === 'COMPLETED' && j.rawOutputKey)
      .slice(0, RECENT_OUTPUTS_LIMIT);

    for (const job of completed) {
      try {
        const obj = await this.storage.getObject('raw-outputs', job.rawOutputKey as string);
        const buf = await readCapped(obj.body, RAW_EXCERPT_BYTES);
        recentOutputs.push({
          scanner: job.scannerName,
          target: job.target,
          excerpt: buf.toString('utf8').trim(),
        });
      } catch (err) {
        this.logger.warn(
          `raw output ${job.rawOutputKey} unavailable for ${job.scannerName}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return { target, scannersRun, recentOutputs };
  }

  /**
   * Legacy world snapshot in the shape the deterministic chain engine expects.
   * The chain path (`ChainDecider`) consumes the chain-engine {@link ChainWorldState};
   * post-SP1 the discovery/finding tables it drew from are empty, so the
   * host-scoped arrays come back empty. Kept separate from {@link build} so the
   * AI path can move to raw output without breaking the chains contract.
   */
  async buildChainSnapshot(
    aiRunId: string,
    _engagementId: string,
    target: string,
  ): Promise<ChainWorldState> {
    const scanJobs = await this.prisma.scanJob.findMany({
      where: { scan: { aiRunId } },
      select: { scannerName: true },
    });
    const scannersRun = [...new Set(scanJobs.map((j) => j.scannerName))];

    return {
      target,
      openPorts: [],
      services: [],
      technologies: [],
      urls: [],
      endpoints: [],
      findings: [],
      scannersRun,
    };
  }
}
