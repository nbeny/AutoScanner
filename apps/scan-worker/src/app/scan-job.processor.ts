import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Queue, type Job } from 'bullmq';
import { PrismaService } from '@autoscanner/database';
import {
  DOCKER_RUNNER,
  type DockerRunner,
  type RunResult,
  type RunSpec,
} from '@autoscanner/docker-runner';
import { LOG_STREAM_PUBLISHER, type LogStreamPublisher } from '@autoscanner/log-stream';
import { QueueName, type ParseJobPayload, type ScanJobPayload } from '@autoscanner/queues';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { OBJECT_STORAGE, rawOutputKey, type ObjectStorage } from '@autoscanner/storage';

@Processor(QueueName.SCAN_JOBS, { concurrency: 4 })
export class ScanJobProcessor extends WorkerHost {
  private readonly logger = new Logger(ScanJobProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScannerRegistry,
    @Inject(DOCKER_RUNNER) private readonly docker: DockerRunner,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @InjectQueue(QueueName.PARSE_JOBS) private readonly parseQueue: Queue<ParseJobPayload>,
    @Inject(LOG_STREAM_PUBLISHER) private readonly logStream: LogStreamPublisher,
  ) {
    super();
  }

  async process(job: Job<ScanJobPayload>): Promise<{ rawOutputKey: string; exitCode: number }> {
    const payload = job.data;
    this.logger.log(`Processing scanJob=${payload.scanJobId} scanner=${payload.scannerName}`);

    const scanner = this.registry.get(payload.scannerName);
    const parsedInput = scanner.inputSchema.parse(payload.input);

    const scanJob = await this.prisma.scanJob.findUniqueOrThrow({
      where: { id: payload.scanJobId },
      include: { scan: true },
    });
    const scanId = scanJob.scanId;

    await this.prisma.scanJob.update({
      where: { id: payload.scanJobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const build = scanner.build(parsedInput, payload.target, {
      scanJobId: payload.scanJobId,
      engagementId: payload.engagementId,
      scratchDir: '/tmp',
    });

    await this.docker.pullIfMissing(scanner.docker.image);

    const runSpec: RunSpec = {
      image: scanner.docker.image,
      cmd: build.cmd,
      env: build.env,
      binds: build.binds,
      stdin: build.stdin,
      network: scanner.docker.network,
      capabilities: { add: scanner.docker.capabilities, drop: ['ALL'] },
      readonlyRootfs: scanner.docker.readonlyRootfs,
      memoryLimitMb: scanner.docker.memoryLimitMb,
      cpuQuota: scanner.docker.cpuQuota,
      timeoutMs: scanner.docker.defaultTimeoutMs,
      user: scanner.docker.network === 'host' ? 'root' : undefined,
    };

    let result: RunResult;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    // If pub/sub is down, a chatty scanner (nuclei emits thousands of chunks)
    // produces one warn per chunk, drowning every other signal in the log.
    // Cap to one warn per scan-job: subsequent failures stay suppressed for
    // this run but the BullMQ retry on a fresh scan-job will warn again.
    let publishFailureLogged = false;
    const safePublish = (stream: 'stdout' | 'stderr', chunk: string): void => {
      void this.logStream
        .publish({ scanJobId: payload.scanJobId, stream, ts: Date.now(), chunk })
        .catch((err) => {
          if (publishFailureLogged) return;
          publishFailureLogged = true;
          this.logger.warn(
            `scanJob=${payload.scanJobId} log stream publish failed (suppressing further warns for this scan): ${(err as Error).message}`,
          );
        });
    };

    try {
      result = await this.docker.run({
        ...runSpec,
        onStdout: (chunk) => {
          stdoutBuffer += chunk;
          safePublish('stdout', chunk);
        },
        onStderr: (chunk) => {
          stderrBuffer += chunk;
          safePublish('stderr', chunk);
        },
      });
    } catch (err) {
      this.logger.error(`scanJob=${payload.scanJobId} failed: ${(err as Error).message}`);
      await this.prisma.scanJob.update({
        where: { id: payload.scanJobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: (err as Error).message,
        },
      });
      throw err;
    }

    const output = scanner.outputs[0];
    const key = rawOutputKey({
      engagementId: payload.engagementId,
      scanId,
      scanJobId: payload.scanJobId,
      scannerName: payload.scannerName,
      format: output.format,
    });

    const body = output.capture === 'stdout' ? stdoutBuffer : stderrBuffer;
    try {
      await this.storage.ensureBucket('raw-outputs');
      await this.storage.putObject({
        bucket: 'raw-outputs',
        key,
        body: Buffer.from(body, 'utf8'),
        contentType: output.format === 'XML' ? 'application/xml' : 'application/octet-stream',
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`scanJob=${payload.scanJobId} storage upload failed: ${message}`);
      await this.prisma.scanJob
        .update({
          where: { id: payload.scanJobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            errorMessage: `storage upload failed: ${message}`,
          },
        })
        .catch((updateErr) => {
          this.logger.warn(
            `scanJob=${payload.scanJobId} FAILED-status reconciliation failed: ${(updateErr as Error).message}`,
          );
        });
      throw err;
    }

    const status = result.timedOut
      ? 'TIMEOUT'
      : result.killedByUser
        ? 'CANCELLED'
        : result.exitCode === 0
          ? 'COMPLETED'
          : 'FAILED';

    // Enqueue BEFORE flipping the ScanJob status to COMPLETED so the
    // orchestrator's polling never observes a clean COMPLETED while no
    // ParseJob is queued. Without this, a Redis blip between the status
    // update and the enqueue would silently drop the asset/finding
    // persistence — the step appears successful but no results materialise.
    if (status === 'COMPLETED') {
      try {
        await this.parseQueue.add('parse', {
          scanJobId: payload.scanJobId,
          rawOutputKey: key,
          parserName: output.parser,
          scannerName: payload.scannerName,
          target: payload.target,
          engagementId: payload.engagementId,
        });
      } catch (err) {
        const message = (err as Error).message;
        this.logger.error(`scanJob=${payload.scanJobId} parse enqueue failed: ${message}`);
        await this.prisma.scanJob
          .update({
            where: { id: payload.scanJobId },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              exitCode: result.exitCode,
              durationMs: result.durationMs,
              rawOutputKey: key,
              errorMessage: `parse enqueue failed: ${message}`,
            },
          })
          .catch((updateErr) => {
            this.logger.warn(
              `scanJob=${payload.scanJobId} FAILED-status reconciliation failed: ${(updateErr as Error).message}`,
            );
          });
        throw err;
      }
    }

    await this.prisma.scanJob.update({
      where: { id: payload.scanJobId },
      data: {
        status,
        completedAt: new Date(),
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        rawOutputKey: key,
      },
    });

    this.logger.log(
      `scanJob=${payload.scanJobId} status=${status} exit=${result.exitCode} duration=${result.durationMs}ms`,
    );

    return { rawOutputKey: key, exitCode: result.exitCode };
  }
}
