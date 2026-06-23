import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Queue, type Job } from 'bullmq';
import { SecretBox } from '@autoscanner/common';
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
import { SECRET_BOX } from './secret-box.provider';
import { ScanControlSubscriber } from './scan-control.subscriber';

// Per-scan capture cap. The docker sandbox limits container memory to ~2 GiB
// (DEFAULT_MEMORY_MB in dockerode-runner) but a scanner can SHIP up to that
// much output to stdout over its lifetime. With `concurrency: 4`, naively
// accumulating chunks into a string lets a single runaway scanner OOM the
// scan-worker (8 GiB sustained worst-case). Matches the parser-worker
// download cap so the two stages agree on the maximum raw output size — a
// scanner that exceeds this here would be rejected downstream anyway.
export const MAX_RAW_OUTPUT_BYTES = 256 * 1024 * 1024;

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
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox,
    private readonly scanControlSubscriber: ScanControlSubscriber,
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

    const out0 = scanner.outputs[0];
    const fileCapture = typeof out0.capture === 'object' ? out0.capture : null;
    let artifactHostDir: string | null = null;
    if (fileCapture) {
      artifactHostDir = await mkdtemp(join(tmpdir(), 'autoscanner-art-'));
    }

    // Outer try/finally ensures artifactHostDir is removed even if the
    // credential-missing throw or docker.run catch-rethrow fires before
    // the store/parse block that originally held the only cleanup.
    try {
      const oastServerUrl = process.env['OAST_SERVER_URL']?.trim();
      const oastToken = process.env['OAST_TOKEN']?.trim();
      const oast = {
        ...(oastServerUrl ? { serverUrl: oastServerUrl } : {}),
        ...(oastToken ? { token: oastToken } : {}),
        allowPublic: process.env['OAST_ALLOW_PUBLIC'] === 'true',
      };
      const build = scanner.build(parsedInput, payload.target, {
        scanJobId: payload.scanJobId,
        engagementId: payload.engagementId,
        scratchDir: artifactHostDir ? '/output' : '/tmp',
        oast,
      });

      let extraEnv: Record<string, string> | undefined;
      if (scanner.requiresCredential) {
        const provider = scanner.requiresCredential;
        const eng = await this.prisma.engagement.findUnique({
          where: { id: payload.engagementId },
          select: { ownerId: true },
        });
        const cred = eng
          ? await this.prisma.apiCredential.findUnique({
              where: { ownerId_provider: { ownerId: eng.ownerId, provider } },
            })
          : null;
        if (!cred) {
          const message = eng
            ? `missing ${provider} API credential for engagement owner`
            : `engagement ${payload.engagementId} not found; cannot resolve ${provider} API credential`;
          await this.prisma.scanJob.update({
            where: { id: payload.scanJobId },
            data: { status: 'FAILED', completedAt: new Date(), errorMessage: message },
          });
          this.logger.error(`scanJob=${payload.scanJobId} ${message}`);
          throw new Error(message);
        }
        const decryptedKey = this.secretBox.open(cred.ciphertext as Buffer);
        extraEnv = { [scanner.credentialEnvVar ?? `${provider}_API_KEY`]: decryptedKey };
      }

      await this.docker.pullIfMissing(scanner.docker.image);

      const runSpec: RunSpec = {
        image: scanner.docker.image,
        cmd: build.cmd,
        env: { ...build.env, ...extraEnv },
        binds: artifactHostDir
          ? [...(build.binds ?? []), { src: artifactHostDir, dst: '/output' }]
          : build.binds,
        stdin: build.stdin,
        network: scanner.docker.network,
        capabilities: { add: scanner.docker.capabilities, drop: ['ALL'] },
        readonlyRootfs: scanner.docker.readonlyRootfs,
        memoryLimitMb: scanner.docker.memoryLimitMb,
        cpuQuota: scanner.docker.cpuQuota,
        timeoutMs: scanner.docker.defaultTimeoutMs,
        user: scanner.docker.network === 'host' ? 'root' : undefined,
      };

      // Only one stream's bytes ever land in MinIO — the other is dead-weight
      // if we accumulate it. Resolve the captured stream up front so the
      // onStdout/onStderr closures can skip buffering the discarded side.
      // For file-capture (object capture), capturedStream is the object itself —
      // it will never equal 'stdout' or 'stderr', so captureChunk buffers nothing.
      const capturedStream = out0.capture;

      let result: RunResult;
      // `string[] + join('')` rather than `string += chunk` — repeated `+=` on
      // large strings is O(n²) in V8 once the rope optimisation gives up.
      const capturedChunks: string[] = [];
      let capturedBytes = 0;
      let oversized = false;
      const oversizeAbort = new AbortController();

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

      const captureChunk = (stream: 'stdout' | 'stderr', chunk: string): void => {
        if (stream !== capturedStream || oversized) return;
        // `Buffer.byteLength`, not `chunk.length`: chunks are JS strings (UTF-16
        // code units); non-ASCII would under-count. The cap is a byte budget
        // because the parser-worker download cap is too.
        const bytes = Buffer.byteLength(chunk, 'utf8');
        if (capturedBytes + bytes > MAX_RAW_OUTPUT_BYTES) {
          oversized = true;
          const streamLabel = typeof capturedStream === 'string' ? capturedStream : 'output';
          this.logger.error(
            `scanJob=${payload.scanJobId} ${streamLabel} output exceeded ${MAX_RAW_OUTPUT_BYTES} bytes — killing container`,
          );
          // Kill the container instead of letting it run to completion. We
          // already know the output is unusable; burning more CPU/disk on it
          // just delays the FAILED status the orchestrator is waiting for.
          oversizeAbort.abort();
          return;
        }
        capturedChunks.push(chunk);
        capturedBytes += bytes;
      };

      this.scanControlSubscriber.register(payload.scanJobId, oversizeAbort);
      try {
        result = await this.docker.run({
          ...runSpec,
          abortSignal: oversizeAbort.signal,
          onStdout: (chunk) => {
            captureChunk('stdout', chunk);
            safePublish('stdout', chunk);
          },
          onStderr: (chunk) => {
            captureChunk('stderr', chunk);
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
      } finally {
        this.scanControlSubscriber.unregister(payload.scanJobId);
      }

      // The abort-on-oversize path tripped `killedByUser` inside docker-runner,
      // but this isn't a user cancellation — surface it as FAILED with an
      // operator-readable message rather than the misleading CANCELLED status
      // the normal mapping below would produce.
      if (oversized) {
        const streamName = typeof capturedStream === 'string' ? capturedStream : 'output';
        const message = `${streamName} output exceeded ${MAX_RAW_OUTPUT_BYTES} bytes`;
        await this.prisma.scanJob
          .update({
            where: { id: payload.scanJobId },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              exitCode: result.exitCode,
              durationMs: result.durationMs,
              errorMessage: message,
            },
          })
          .catch((updateErr) => {
            this.logger.warn(
              `scanJob=${payload.scanJobId} FAILED-status reconciliation failed: ${(updateErr as Error).message}`,
            );
          });
        throw new Error(`scanJob=${payload.scanJobId} ${message}`);
      }

      const key = rawOutputKey({
        engagementId: payload.engagementId,
        scanId,
        scanJobId: payload.scanJobId,
        scannerName: payload.scannerName,
        format: out0.format,
      });

      let storeBody: Buffer;
      let storeContentType: string;

      if (fileCapture && artifactHostDir) {
        // File-capture branch: read the produced file from the bound host dir.
        const files = await readdir(artifactHostDir);
        // Empty capture.path ⇒ take the only file the scanner produced (per-job mkdtemp isolates runs, so there is exactly one).
        const wanted = fileCapture.path
          ? files.find((f) => f === fileCapture.path || f.endsWith(fileCapture.path))
          : files[0];
        if (!wanted) {
          await this.prisma.scanJob.update({
            where: { id: payload.scanJobId },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              exitCode: result.exitCode,
              durationMs: result.durationMs,
              errorMessage: 'scanner produced no artifact file',
            },
          });
          throw new Error(`scanJob=${payload.scanJobId} produced no artifact file`);
        }
        storeBody = await readFile(join(artifactHostDir, wanted));
        if (storeBody.byteLength > MAX_RAW_OUTPUT_BYTES) {
          await this.prisma.scanJob.update({
            where: { id: payload.scanJobId },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              exitCode: result.exitCode,
              durationMs: result.durationMs,
              errorMessage: `artifact exceeded ${MAX_RAW_OUTPUT_BYTES} bytes`,
            },
          });
          throw new Error(`scanJob=${payload.scanJobId} artifact too large`);
        }
        storeContentType = wanted.endsWith('.png') ? 'image/png' : 'application/octet-stream';
      } else {
        // Text-capture branch: existing stdout/stderr path.
        storeBody = Buffer.from(capturedChunks.join(''), 'utf8');
        storeContentType = out0.format === 'XML' ? 'application/xml' : 'application/octet-stream';
      }

      try {
        await this.storage.ensureBucket('raw-outputs');
        await this.storage.putObject({
          bucket: 'raw-outputs',
          key,
          body: storeBody,
          contentType: storeContentType,
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
      // BINARY format scanners produce no normalised parse output — skip enqueue.
      if (status === 'COMPLETED' && out0.format !== 'BINARY') {
        try {
          await this.parseQueue.add('parse', {
            scanJobId: payload.scanJobId,
            rawOutputKey: key,
            parserName: out0.parser,
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
    } finally {
      // Always clean up the per-job host dir (never leaks even on error paths).
      if (artifactHostDir) {
        await rm(artifactHostDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
