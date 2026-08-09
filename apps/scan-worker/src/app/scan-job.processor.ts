import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Prisma, ScanStatus } from '@prisma/client';
import { SecretBox } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import { ScanJobDonePublisher } from '@autoscanner/scan-events';
import {
  DOCKER_RUNNER,
  type DockerRunner,
  type RunResult,
  type RunSpec,
} from '@autoscanner/docker-runner';
import { LOG_STREAM_PUBLISHER, LogBuffer, type LogStreamPublisher } from '@autoscanner/log-stream';
import type { ParseJobPayload, ScanJobPayload } from '@autoscanner/queues';
import {
  ConsumerRegistrar,
  JOB_BUS,
  MessageConsumer,
  type JobBus,
  type MessageContext,
} from '@autoscanner/messaging';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { OBJECT_STORAGE, rawOutputKey, scanLogKey, type ObjectStorage } from '@autoscanner/storage';
import { SECRET_BOX } from './secret-box.provider';
import { ScanControlSubscriber } from './scan-control.subscriber';

const PARSE_TOPIC = 'security.parse.requested';
const SCANNER_TOPIC = 'security.scanner.requested';
const TERMINAL_SCAN_STATUSES: ScanStatus[] = ['COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED'];
const TERMINAL_STATUSES = new Set<string>(TERMINAL_SCAN_STATUSES);

/**
 * Aggregate a parent Scan's status from its ScanJobs' statuses.
 *
 * Historically the Scan row was created QUEUED and never moved: only the
 * ScanJob went QUEUED→RUNNING→COMPLETED, so every finished scan stayed
 * "QUEUED" forever — clogging the cockpit's active-scanners panel and never
 * showing up under the Completed filter (so its results were unreachable).
 *
 * Rules (a Scan can hold N jobs — templates/AutoHunt create 1:1 today, but the
 * schema allows more):
 *  - All jobs terminal → derive a terminal Scan status, worst-outcome-wins:
 *    FAILED > TIMEOUT > CANCELLED > COMPLETED.
 *  - Otherwise, if any job has started or finished → RUNNING; else QUEUED.
 */
export function deriveScanStatus(jobStatuses: string[]): ScanStatus {
  if (jobStatuses.length === 0) return 'QUEUED';
  const allTerminal = jobStatuses.every((s) => TERMINAL_STATUSES.has(s));
  if (allTerminal) {
    if (jobStatuses.includes('FAILED')) return 'FAILED';
    if (jobStatuses.includes('TIMEOUT')) return 'TIMEOUT';
    if (jobStatuses.includes('CANCELLED')) return 'CANCELLED';
    return 'COMPLETED';
  }
  const anyStarted = jobStatuses.some((s) => s === 'RUNNING' || TERMINAL_STATUSES.has(s));
  return anyStarted ? 'RUNNING' : 'QUEUED';
}

// Per-scan capture cap. The docker sandbox limits container memory to ~2 GiB
// (DEFAULT_MEMORY_MB in dockerode-runner) but a scanner can SHIP up to that
// much output to stdout over its lifetime. With `concurrency: 4`, naively
// accumulating chunks into a string lets a single runaway scanner OOM the
// scan-worker (8 GiB sustained worst-case). Matches the parser-worker
// download cap so the two stages agree on the maximum raw output size — a
// scanner that exceeds this here would be rejected downstream anyway.
export const MAX_RAW_OUTPUT_BYTES = 256 * 1024 * 1024;

@Injectable()
export class ScanJobProcessor
  extends MessageConsumer<ScanJobPayload>
  implements OnApplicationBootstrap
{
  readonly topic = SCANNER_TOPIC;
  private readonly logger = new Logger(ScanJobProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ScannerRegistry,
    @Inject(DOCKER_RUNNER) private readonly docker: DockerRunner,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(JOB_BUS) private readonly bus: JobBus,
    @Inject(ConsumerRegistrar) private readonly registrar: ConsumerRegistrar,
    @Inject(LOG_STREAM_PUBLISHER) private readonly logStream: LogStreamPublisher,
    @Inject(SECRET_BOX) private readonly secretBox: SecretBox,
    private readonly scanControlSubscriber: ScanControlSubscriber,
    private readonly scanJobDone: ScanJobDonePublisher,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.registrar.register(this);
  }

  /**
   * Writes a terminal ScanJob status AND publishes the `scanjob:done:<id>` wake-up (SP3), so the
   * orchestrator/AutoHunt waiters settle on the push instead of their fallback poll. The publish
   * is internally best-effort; if the DB update itself throws, the caller's `.catch` handles it
   * and no wake-up is sent (correct — the row isn't terminal).
   */
  private async finalizeScanJob(args: {
    where: Prisma.ScanJobWhereUniqueInput;
    data: Prisma.ScanJobUpdateInput;
  }): Promise<void> {
    const updated = await this.prisma.scanJob.update({ ...args, select: { scanId: true } });
    await this.scanJobDone.publishDone(String(args.where.id), String(args.data.status));
    await this.reconcileParentScanStatus(updated.scanId, String(args.where.id));
  }

  /**
   * Roll the parent Scan's status up from its jobs after a job transition.
   * Best-effort: a reconcile failure must never fail the scan job (the job's
   * own terminal status is already committed). The `updateMany` guard skips any
   * Scan that is already terminal, so this is idempotent on redelivery and can
   * never clobber an operator's CANCELLED (or a dispatch-time FAILED).
   */
  private async reconcileParentScanStatus(scanId: string, scanJobId: string): Promise<void> {
    if (!scanId) return;
    try {
      const jobs = await this.prisma.scanJob.findMany({
        where: { scanId },
        select: { status: true, completedAt: true },
      });
      const status = deriveScanStatus(jobs.map((j) => j.status));
      const data: Prisma.ScanUpdateManyMutationInput = { status };
      if (TERMINAL_STATUSES.has(status)) {
        const times = jobs.map((j) => j.completedAt?.getTime() ?? Date.now());
        data.completedAt = new Date(Math.max(...times));
      }
      await this.prisma.scan.updateMany({
        where: { id: scanId, status: { notIn: TERMINAL_SCAN_STATUSES } },
        data,
      });
    } catch (err) {
      this.logger.warn(
        `scanJob=${scanJobId} parent-scan reconcile failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Persiste les logs combinés dans MinIO (bucket `logs`). Best-effort : un échec
   * ne doit jamais faire échouer le scan — les logs sont un confort d'UX, pas le
   * résultat. Idempotent : réécrit le même objet sur retry.
   */
  private async persistLogs(scanJobId: string, text: string): Promise<void> {
    try {
      await this.storage.ensureBucket('logs');
      await this.storage.putObject({
        bucket: 'logs',
        key: scanLogKey(scanJobId),
        body: Buffer.from(text, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      });
    } catch (err) {
      this.logger.warn(`scanJob=${scanJobId} log persist failed: ${(err as Error).message}`);
    }
  }

  async process(
    ctx: MessageContext<ScanJobPayload>,
  ): Promise<{ rawOutputKey: string; exitCode: number }> {
    const payload = ctx.payload;
    this.logger.log(`Processing scanJob=${payload.scanJobId} scanner=${payload.scannerName}`);

    const scanner = this.registry.get(payload.scannerName);
    const parsedInput = scanner.inputSchema.parse(payload.input);

    const scanJob = await this.prisma.scanJob.findUniqueOrThrow({
      where: { id: payload.scanJobId },
      include: { scan: true },
    });

    // Terminal-status guard. Kafka messages cannot be removed once published, so a
    // ScanJob cancelled while QUEUED still gets delivered here — running it would
    // resurrect a scan the operator stopped. This also makes redelivery (at-least-once)
    // a no-op for jobs that already reached a terminal state.
    if (TERMINAL_STATUSES.has(scanJob.status)) {
      this.logger.log(
        `scanJob=${payload.scanJobId} already ${scanJob.status} — skipping (cancelled or already processed)`,
      );
      // Re-wake any waiter that missed the original push (SP3): a redelivered message for an
      // already-terminal job must not leave the orchestrator/AutoHunt loop polling.
      await this.scanJobDone.publishDone(payload.scanJobId, scanJob.status);
      // Self-heal: if the original run died between the job's terminal update and
      // the parent-scan reconcile, redelivery settles the Scan now.
      await this.reconcileParentScanStatus(scanJob.scanId, payload.scanJobId);
      return { rawOutputKey: scanJob.rawOutputKey ?? '', exitCode: 0 };
    }

    const scanId = scanJob.scanId;

    await this.prisma.scanJob.update({
      where: { id: payload.scanJobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    // Promote the parent Scan QUEUED→RUNNING so the UI stops showing it as
    // pending the moment the container starts.
    await this.reconcileParentScanStatus(scanId, payload.scanJobId);

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
      const authCookie = process.env['SCAN_AUTH_COOKIE']?.trim();
      let authHeaders: Record<string, string> | undefined;
      const rawAuthHeaders = process.env['SCAN_AUTH_HEADERS']?.trim();
      if (rawAuthHeaders) {
        try {
          const parsed = JSON.parse(rawAuthHeaders) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            authHeaders = parsed as Record<string, string>;
          }
        } catch {
          this.logger.warn(
            `scanJob=${payload.scanJobId} ignoring malformed SCAN_AUTH_HEADERS JSON`,
          );
        }
      }
      let auth: { cookie?: string; headers?: Record<string, string> } | undefined =
        authCookie || authHeaders
          ? {
              ...(authCookie ? { cookie: authCookie } : {}),
              ...(authHeaders ? { headers: authHeaders } : {}),
            }
          : undefined;

      // A per-engagement auth profile (sealed in the DB) takes precedence over
      // the worker-global env auth: it is more specific and scoped to one
      // engagement. Falls back to the env auth above when none is configured.
      const authProfile = await this.prisma.engagementAuthProfile.findUnique({
        where: { engagementId: payload.engagementId },
      });
      if (authProfile) {
        try {
          auth = JSON.parse(this.secretBox.open(authProfile.ciphertext as Buffer)) as {
            cookie?: string;
            headers?: Record<string, string>;
          };
        } catch (err) {
          this.logger.warn(
            `scanJob=${payload.scanJobId} failed to decode engagement auth profile: ${(err as Error).message}`,
          );
        }
      }

      const build = scanner.build(parsedInput, payload.target, {
        scanJobId: payload.scanJobId,
        engagementId: payload.engagementId,
        scratchDir: artifactHostDir ? '/output' : '/tmp',
        oast,
        auth,
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
          await this.finalizeScanJob({
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

      const logBuffer = new LogBuffer();
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
      const flushTimer = setInterval(() => {
        void this.persistLogs(payload.scanJobId, logBuffer.snapshot());
      }, 3000);
      try {
        result = await this.docker.run({
          ...runSpec,
          abortSignal: oversizeAbort.signal,
          onStdout: (chunk) => {
            captureChunk('stdout', chunk);
            logBuffer.append('stdout', chunk);
            safePublish('stdout', chunk);
          },
          onStderr: (chunk) => {
            captureChunk('stderr', chunk);
            logBuffer.append('stderr', chunk);
            safePublish('stderr', chunk);
          },
        });
      } catch (err) {
        this.logger.error(`scanJob=${payload.scanJobId} failed: ${(err as Error).message}`);
        await this.persistLogs(payload.scanJobId, logBuffer.snapshot());
        await this.finalizeScanJob({
          where: { id: payload.scanJobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: (err as Error).message,
          },
        });
        throw err;
      } finally {
        clearInterval(flushTimer);
        this.scanControlSubscriber.unregister(payload.scanJobId);
      }
      // Flush final garanti sur le chemin succès (le chemin erreur a déjà flushé ci-dessus).
      await this.persistLogs(payload.scanJobId, logBuffer.snapshot());

      // The abort-on-oversize path tripped `killedByUser` inside docker-runner,
      // but this isn't a user cancellation — surface it as FAILED with an
      // operator-readable message rather than the misleading CANCELLED status
      // the normal mapping below would produce.
      if (oversized) {
        const streamName = typeof capturedStream === 'string' ? capturedStream : 'output';
        const message = `${streamName} output exceeded ${MAX_RAW_OUTPUT_BYTES} bytes`;
        await this.finalizeScanJob({
          where: { id: payload.scanJobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            errorMessage: message,
          },
        }).catch((updateErr) => {
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
          await this.finalizeScanJob({
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
          await this.finalizeScanJob({
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
        await this.finalizeScanJob({
          where: { id: payload.scanJobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            errorMessage: `storage upload failed: ${message}`,
          },
        }).catch((updateErr) => {
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
          await this.bus.publish<ParseJobPayload>(PARSE_TOPIC, payload.scanJobId, {
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
          await this.finalizeScanJob({
            where: { id: payload.scanJobId },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              exitCode: result.exitCode,
              durationMs: result.durationMs,
              rawOutputKey: key,
              errorMessage: `parse enqueue failed: ${message}`,
            },
          }).catch((updateErr) => {
            this.logger.warn(
              `scanJob=${payload.scanJobId} FAILED-status reconciliation failed: ${(updateErr as Error).message}`,
            );
          });
          throw err;
        }
      }

      await this.finalizeScanJob({
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
