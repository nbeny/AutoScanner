import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { DOCKER_RUNNER, type DockerRunner } from '@autoscanner/docker-runner';
import { OBJECT_STORAGE, scanLogKey, type ObjectStorage } from '@autoscanner/storage';
import { LogBuffer } from '@autoscanner/log-stream';
import {
  ConsumerRegistrar,
  JOB_BUS,
  MessageConsumer,
  type JobBus,
  type MessageContext,
} from '@autoscanner/messaging';
import type { KaliToolParsePayload, KaliToolRunPayload } from '@autoscanner/queues';
import { KaliToolRunEventsPublisher } from './kali-tool-run-events.publisher';
import {
  KALI_MAX_OUTPUT_BYTES,
  KALI_TOOLBOX_IMAGE,
  kaliRawKey,
  kaliToolboxRunSpec,
} from './kali-toolbox';

const RUN_TOPIC = 'security.kalitool.requested';
const PARSE_TOPIC = 'security.kalitool.parse.requested';
const TERMINAL = new Set(['COMPLETED', 'FAILED']);

@Injectable()
export class KaliRunProcessor
  extends MessageConsumer<KaliToolRunPayload>
  implements OnApplicationBootstrap
{
  readonly topic = RUN_TOPIC;
  private readonly logger = new Logger(KaliRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCKER_RUNNER) private readonly docker: DockerRunner,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
    private readonly events: KaliToolRunEventsPublisher,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  async process(ctx: MessageContext<KaliToolRunPayload>): Promise<void> {
    const { runId } = ctx.payload;
    const run = await this.prisma.kaliToolRun.findUniqueOrThrow({ where: { id: runId } });
    if (TERMINAL.has(run.status)) {
      this.logger.log(`kaliToolRun=${runId} already ${run.status} — skip`);
      return;
    }

    const args = Array.isArray(run.argsJson) ? (run.argsJson as string[]) : [];
    const argv = [run.binary, ...args];

    await this.prisma.kaliToolRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    await this.events.publish(runId, { type: 'status', status: 'RUNNING' });

    const key = kaliRawKey(run.engagementId, runId);
    const chunks: string[] = [];
    let bytes = 0;
    let oversized = false;
    const capture = (c: string) => {
      if (oversized) return;
      const b = Buffer.byteLength(c, 'utf8');
      if (bytes + b > KALI_MAX_OUTPUT_BYTES) {
        oversized = true;
        return;
      }
      chunks.push(c);
      bytes += b;
    };
    const logBuffer = new LogBuffer();

    try {
      await this.docker.pullIfMissing(KALI_TOOLBOX_IMAGE);
      const result = await this.docker.run({
        ...kaliToolboxRunSpec(argv),
        onStdout: (c) => {
          capture(c);
          logBuffer.append('stdout', c);
        },
        onStderr: (c) => {
          capture(c);
          logBuffer.append('stderr', c);
        },
      });

      await this.storage.ensureBucket('raw-outputs');
      await this.storage.putObject({
        bucket: 'raw-outputs',
        key,
        body: Buffer.from(chunks.join(''), 'utf8'),
        contentType: 'application/octet-stream',
      });

      try {
        await this.storage.ensureBucket('logs');
        await this.storage.putObject({
          bucket: 'logs',
          key: scanLogKey(runId),
          body: Buffer.from(logBuffer.snapshot(), 'utf8'),
          contentType: 'text/plain; charset=utf-8',
        });
      } catch (err) {
        this.logger.warn(`kaliToolRun=${runId} log persist failed: ${(err as Error).message}`);
      }

      await this.prisma.kaliToolRun.update({
        where: { id: runId },
        data: { exitCode: result.exitCode, rawOutputRef: key },
      });

      await this.bus.publish<KaliToolParsePayload>(PARSE_TOPIC, runId, {
        runId,
        rawOutputKey: key,
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`kaliToolRun=${runId} failed: ${message}`);
      await this.prisma.kaliToolRun.update({
        where: { id: runId },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
      });
      await this.events.publish(runId, { type: 'error', message });
      try {
        await this.storage.ensureBucket('logs');
        await this.storage.putObject({
          bucket: 'logs',
          key: scanLogKey(runId),
          body: Buffer.from(logBuffer.snapshot(), 'utf8'),
          contentType: 'text/plain; charset=utf-8',
        });
      } catch {
        /* best-effort */
      }
      throw err;
    }
  }
}
