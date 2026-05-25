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

    try {
      result = await this.docker.run({
        ...runSpec,
        onStdout: (chunk) => {
          stdoutBuffer += chunk;
        },
        onStderr: (chunk) => {
          stderrBuffer += chunk;
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
    await this.storage.ensureBucket('raw-outputs');
    await this.storage.putObject({
      bucket: 'raw-outputs',
      key,
      body: Buffer.from(body, 'utf8'),
      contentType: output.format === 'XML' ? 'application/xml' : 'application/octet-stream',
    });

    const status = result.timedOut
      ? 'TIMEOUT'
      : result.killedByUser
        ? 'CANCELLED'
        : result.exitCode === 0
          ? 'COMPLETED'
          : 'FAILED';

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

    if (status === 'COMPLETED') {
      await this.parseQueue.add('parse', {
        scanJobId: payload.scanJobId,
        rawOutputKey: key,
        parserName: output.parser,
        scannerName: payload.scannerName,
        target: payload.target,
        engagementId: payload.engagementId,
      });
    }

    this.logger.log(
      `scanJob=${payload.scanJobId} status=${status} exit=${result.exitCode} duration=${result.durationMs}ms`,
    );

    return { rawOutputKey: key, exitCode: result.exitCode };
  }
}
