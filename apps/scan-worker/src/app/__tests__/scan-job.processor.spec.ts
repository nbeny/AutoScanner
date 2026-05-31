import type { Job, Queue } from 'bullmq';
import type { PrismaService } from '@autoscanner/database';
import type { DockerRunner, RunResult, RunSpec } from '@autoscanner/docker-runner';
import type { LogStreamPublisher } from '@autoscanner/log-stream';
import type { ParseJobPayload, ScanJobPayload } from '@autoscanner/queues';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { NmapScanner } from '@autoscanner/scanners-nmap';
import type { ObjectStorage } from '@autoscanner/storage';

import { MAX_RAW_OUTPUT_BYTES, ScanJobProcessor } from '../scan-job.processor';

const NMAP_XML =
  '<?xml version="1.0"?><nmaprun><host><address addr="127.0.0.1" addrtype="ipv4"/></host></nmaprun>';

describe('ScanJobProcessor', () => {
  let prisma: jest.Mocked<PrismaService>;
  let docker: jest.Mocked<DockerRunner>;
  let storage: jest.Mocked<ObjectStorage>;
  let parseQueue: jest.Mocked<Queue<ParseJobPayload>>;
  let logStream: jest.Mocked<LogStreamPublisher>;
  let registry: ScannerRegistry;
  let processor: ScanJobProcessor;

  beforeEach(() => {
    prisma = {
      scanJob: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'job_1',
          scanId: 'scan_1',
          scannerName: 'nmap',
          target: '127.0.0.1',
          status: 'QUEUED',
          scan: { id: 'scan_1', engagementId: 'eng_1' },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as jest.Mocked<PrismaService>;

    docker = {
      pullIfMissing: jest.fn().mockResolvedValue(undefined),
      inspect: jest.fn().mockResolvedValue({ exists: true }),
      run: jest.fn(async (spec: RunSpec): Promise<RunResult> => {
        spec.onStdout?.(NMAP_XML);
        return {
          exitCode: 0,
          durationMs: 1234,
          containerId: 'c_1',
          timedOut: false,
          killedByUser: false,
        };
      }),
    } as unknown as jest.Mocked<DockerRunner>;

    storage = {
      ensureBucket: jest.fn().mockResolvedValue(undefined),
      putObject: jest.fn().mockResolvedValue({ etag: 'abc' }),
      getObject: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
      presignGetUrl: jest.fn(),
      presignPutUrl: jest.fn(),
    } as unknown as jest.Mocked<ObjectStorage>;

    parseQueue = { add: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<
      Queue<ParseJobPayload>
    >;

    logStream = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<LogStreamPublisher>;

    registry = new ScannerRegistry();
    registry.register(NmapScanner);

    processor = new ScanJobProcessor(prisma, registry, docker, storage, parseQueue, logStream);
  });

  const job = (payload: ScanJobPayload) =>
    ({
      id: 'bull_1',
      name: 'scan',
      data: payload,
      attemptsMade: 0,
    }) as unknown as Job<ScanJobPayload>;

  it('runs scanner, uploads stdout to MinIO, enqueues parse job, marks COMPLETED', async () => {
    const payload: ScanJobPayload = {
      scanJobId: 'job_1',
      scannerName: 'nmap',
      target: '127.0.0.1',
      input: { ports: '1-100' },
      engagementId: 'eng_1',
    };

    const result = await processor.process(job(payload));

    expect(docker.pullIfMissing).toHaveBeenCalledWith('instrumentisto/nmap:latest');
    expect(docker.run).toHaveBeenCalledTimes(1);
    expect(storage.ensureBucket).toHaveBeenCalledWith('raw-outputs');
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'raw-outputs',
        key: 'eng_1/scan_1/job_1/nmap-xml.xml',
        contentType: 'application/xml',
      }),
    );
    expect(parseQueue.add).toHaveBeenCalledWith(
      'parse',
      expect.objectContaining({
        scanJobId: 'job_1',
        rawOutputKey: 'eng_1/scan_1/job_1/nmap-xml.xml',
        parserName: 'nmap-xml',
        scannerName: 'nmap',
        target: '127.0.0.1',
        engagementId: 'eng_1',
      }),
    );

    expect(prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({ status: 'RUNNING', startedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          exitCode: 0,
          durationMs: 1234,
          rawOutputKey: 'eng_1/scan_1/job_1/nmap-xml.xml',
        }),
      }),
    );

    expect(result).toEqual({ rawOutputKey: 'eng_1/scan_1/job_1/nmap-xml.xml', exitCode: 0 });
  });

  it('marks TIMEOUT and does NOT enqueue parse when runner times out', async () => {
    docker.run.mockResolvedValueOnce({
      exitCode: 137,
      durationMs: 60_000,
      containerId: 'c_2',
      timedOut: true,
      killedByUser: false,
    });

    await processor.process(
      job({
        scanJobId: 'job_1',
        scannerName: 'nmap',
        target: '127.0.0.1',
        input: {},
        engagementId: 'eng_1',
      }),
    );

    expect(parseQueue.add).not.toHaveBeenCalled();
    expect(prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'TIMEOUT', exitCode: 137 }),
      }),
    );
  });

  it('marks FAILED with a storage error message and does NOT enqueue parse when storage.putObject throws', async () => {
    storage.putObject.mockRejectedValueOnce(new Error('minio unreachable'));

    await expect(
      processor.process(
        job({
          scanJobId: 'job_1',
          scannerName: 'nmap',
          target: '127.0.0.1',
          input: {},
          engagementId: 'eng_1',
        }),
      ),
    ).rejects.toThrow('minio unreachable');

    expect(parseQueue.add).not.toHaveBeenCalled();
    expect(prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'storage upload failed: minio unreachable',
        }),
      }),
    );
  });

  it('marks FAILED with a parse-enqueue error message when parseQueue.add throws (so orchestrator never observes a phantom COMPLETED)', async () => {
    parseQueue.add.mockRejectedValueOnce(new Error('redis is down'));

    await expect(
      processor.process(
        job({
          scanJobId: 'job_1',
          scannerName: 'nmap',
          target: '127.0.0.1',
          input: {},
          engagementId: 'eng_1',
        }),
      ),
    ).rejects.toThrow('redis is down');

    expect(parseQueue.add).toHaveBeenCalledTimes(1);
    // The final status update must NOT have flipped COMPLETED — the
    // orchestrator's polling would have treated that as a clean step.
    const completedUpdates = (prisma.scanJob.update as jest.Mock).mock.calls.filter(
      ([arg]) => (arg as { data: { status?: string } }).data.status === 'COMPLETED',
    );
    expect(completedUpdates).toHaveLength(0);
    expect(prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'parse enqueue failed: redis is down',
          rawOutputKey: 'eng_1/scan_1/job_1/nmap-xml.xml',
        }),
      }),
    );
  });

  it('still re-throws the original error when the FAILED reconciliation update itself fails', async () => {
    parseQueue.add.mockRejectedValueOnce(new Error('redis is down'));
    // The RUNNING-status update at the start works; the reconciliation
    // update is the second call and will reject.
    (prisma.scanJob.update as jest.Mock)
      .mockResolvedValueOnce({}) // RUNNING flip
      .mockRejectedValueOnce(new Error('db is down')); // reconciliation

    const warnSpy = jest
      .spyOn((processor as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      processor.process(
        job({
          scanJobId: 'job_1',
          scannerName: 'nmap',
          target: '127.0.0.1',
          input: {},
          engagementId: 'eng_1',
        }),
      ),
    ).rejects.toThrow(/redis is down/);

    // The masked update failure must surface as a warn so operators can
    // distinguish "Redis blip" from "Redis blip + DB also unreachable".
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/reconciliation failed.*db is down/),
    );
  });

  it('marks FAILED and re-throws when docker.run throws', async () => {
    docker.run.mockRejectedValueOnce(new Error('boom'));

    await expect(
      processor.process(
        job({
          scanJobId: 'job_1',
          scannerName: 'nmap',
          target: '127.0.0.1',
          input: {},
          engagementId: 'eng_1',
        }),
      ),
    ).rejects.toThrow('boom');

    expect(parseQueue.add).not.toHaveBeenCalled();
    expect(prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', errorMessage: 'boom' }),
      }),
    );
  });

  it('warns only once per scan-job when log stream publish keeps failing (no flood)', async () => {
    // Simulate Redis pub/sub down: every publish rejects. A chatty scanner
    // emitting many chunks must not produce one warn per chunk.
    logStream.publish.mockRejectedValue(new Error('redis pubsub down'));

    // Docker mock that emits stdout 50 times to mimic a chatty scanner.
    docker.run.mockImplementationOnce(async (spec: RunSpec): Promise<RunResult> => {
      for (let i = 0; i < 50; i++) spec.onStdout?.(NMAP_XML);
      return {
        exitCode: 0,
        durationMs: 100,
        containerId: 'c_x',
        timedOut: false,
        killedByUser: false,
      };
    });

    const warnSpy = jest
      .spyOn((processor as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    await processor.process(
      job({
        scanJobId: 'job_1',
        scannerName: 'nmap',
        target: '127.0.0.1',
        input: {},
        engagementId: 'eng_1',
      }),
    );

    // Yield enough microtasks for all 50 publish rejections to settle.
    await new Promise((r) => setImmediate(r));

    const publishWarns = warnSpy.mock.calls.filter(([msg]) =>
      typeof msg === 'string' ? msg.includes('log stream publish failed') : false,
    );
    expect(publishWarns).toHaveLength(1);
    expect(logStream.publish).toHaveBeenCalledTimes(50);
  });

  it('aborts the container and marks FAILED when captured stream exceeds MAX_RAW_OUTPUT_BYTES (no OOM)', async () => {
    // Simulate a runaway scanner that ships an oversize chunk. nmap captures
    // stdout, so we trip the cap on the stdout path.
    const oversizeChunk = Buffer.alloc(MAX_RAW_OUTPUT_BYTES + 1, 0x61).toString('utf8');
    let abortedDuringRun = false;
    docker.run.mockImplementationOnce(async (spec: RunSpec): Promise<RunResult> => {
      spec.onStdout?.(oversizeChunk);
      abortedDuringRun = spec.abortSignal?.aborted ?? false;
      return {
        exitCode: 137,
        durationMs: 42,
        containerId: 'c_oom',
        // Real docker-runner sets killedByUser=true after the abortSignal
        // fires; we mirror that so the override path is exercised.
        timedOut: false,
        killedByUser: true,
      };
    });

    await expect(
      processor.process(
        job({
          scanJobId: 'job_1',
          scannerName: 'nmap',
          target: '127.0.0.1',
          input: {},
          engagementId: 'eng_1',
        }),
      ),
    ).rejects.toThrow(/stdout output exceeded \d+ bytes/);

    // Cap was hit synchronously from the first chunk, so the abort signal
    // must have been raised before docker.run returned.
    expect(abortedDuringRun).toBe(true);

    // Storage upload and parse enqueue must NOT have happened — the output
    // is unusable.
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(parseQueue.add).not.toHaveBeenCalled();

    // Status must be FAILED with the explicit cap-exceeded message — NOT
    // CANCELLED (which is what the normal status mapping would produce for
    // killedByUser=true).
    expect(prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job_1' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringMatching(/stdout output exceeded \d+ bytes/),
        }),
      }),
    );
    const cancelledUpdates = (prisma.scanJob.update as jest.Mock).mock.calls.filter(
      ([arg]) => (arg as { data: { status?: string } }).data.status === 'CANCELLED',
    );
    expect(cancelledUpdates).toHaveLength(0);
  });
});
