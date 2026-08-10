import * as fs from 'node:fs';
import { join } from 'node:path';
import { KALI_TOOLBOX_IMAGE, SecretBox } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';
import type { DockerRunner, RunResult, RunSpec } from '@autoscanner/docker-runner';
import type { LogStreamPublisher } from '@autoscanner/log-stream';
import type { ScanJobPayload } from '@autoscanner/queues';
import type { ConsumerRegistrar, MessageContext } from '@autoscanner/messaging';
import { ScannerRegistry, type ScannerDefinition } from '@autoscanner/scanner-sdk';
import { NmapScanner } from '@autoscanner/scanners-nmap';
import type { ObjectStorage } from '@autoscanner/storage';

import { MAX_RAW_OUTPUT_BYTES, ScanJobProcessor, deriveScanStatus } from '../scan-job.processor';
import type { ScanControlSubscriber } from '../scan-control.subscriber';

const NMAP_XML =
  '<?xml version="1.0"?><nmaprun><host><address addr="127.0.0.1" addrtype="ipv4"/></host></nmaprun>';

describe('ScanJobProcessor', () => {
  let prisma: jest.Mocked<PrismaService>;
  let docker: jest.Mocked<DockerRunner>;
  let storage: jest.Mocked<ObjectStorage>;
  let bus: { publish: jest.Mock };
  let logStream: jest.Mocked<LogStreamPublisher>;
  let registry: ScannerRegistry;
  let secretBox: jest.Mocked<SecretBox>;
  let scanControlSubscriber: jest.Mocked<ScanControlSubscriber>;
  let scanJobDone: { publishDone: jest.Mock };
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
        update: jest.fn().mockResolvedValue({ scanId: 'scan_1' }),
        findMany: jest.fn().mockResolvedValue([{ status: 'COMPLETED', completedAt: new Date() }]),
      },
      scan: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      engagement: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      apiCredential: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      engagementAuthProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
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

    bus = { publish: jest.fn().mockResolvedValue(undefined) };

    logStream = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<LogStreamPublisher>;

    registry = new ScannerRegistry();
    registry.register(NmapScanner);

    secretBox = {
      open: jest.fn(),
      seal: jest.fn(),
      openRaw: jest.fn(),
    } as unknown as jest.Mocked<SecretBox>;

    scanControlSubscriber = {
      register: jest.fn(),
      unregister: jest.fn(),
      handleMessage: jest.fn(),
      onModuleInit: jest.fn(),
    } as unknown as jest.Mocked<ScanControlSubscriber>;

    scanJobDone = { publishDone: jest.fn().mockResolvedValue(undefined) };

    processor = new ScanJobProcessor(
      prisma,
      registry,
      docker,
      storage,
      bus,
      { register: jest.fn() } as unknown as ConsumerRegistrar,
      logStream,
      secretBox,
      scanControlSubscriber,
      scanJobDone as never,
    );
  });

  const job = (payload: ScanJobPayload) =>
    ({
      id: 'msg_1',
      type: 'security.scanner.requested',
      key: payload.scanJobId,
      attempt: 1,
      payload,
    }) as MessageContext<ScanJobPayload>;

  it('runs scanner, uploads stdout to MinIO, enqueues parse job, marks COMPLETED', async () => {
    const payload: ScanJobPayload = {
      scanJobId: 'job_1',
      scannerName: 'nmap',
      target: '127.0.0.1',
      input: { ports: '1-100' },
      engagementId: 'eng_1',
    };

    const result = await processor.process(job(payload));

    // nmap is on the Kali-toolbox allowlist, so it runs in the shared image.
    expect(docker.pullIfMissing).toHaveBeenCalledWith(KALI_TOOLBOX_IMAGE);
    expect(docker.run).toHaveBeenCalledTimes(1);
    expect(storage.ensureBucket).toHaveBeenCalledWith('raw-outputs');
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'raw-outputs',
        key: 'eng_1/scan_1/job_1/nmap-xml.xml',
        contentType: 'application/xml',
      }),
    );
    expect(bus.publish).toHaveBeenCalledWith(
      'security.parse.requested',
      'job_1',
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
    // SP3: the completion wake-up fires so the orchestrator/AutoHunt waiters don't poll.
    expect(scanJobDone.publishDone).toHaveBeenCalledWith('job_1', 'COMPLETED');

    // The parent Scan is rolled up from its jobs so it no longer stays stuck at
    // QUEUED. The updateMany guard skips any already-terminal Scan (idempotent).
    expect(prisma.scan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'scan_1', status: { notIn: ['COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED'] } },
        data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
      }),
    );
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

    expect(bus.publish).not.toHaveBeenCalled();
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

    expect(bus.publish).not.toHaveBeenCalled();
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

  it('marks FAILED with a parse-enqueue error message when publishing the parse message throws (so orchestrator never observes a phantom COMPLETED)', async () => {
    bus.publish.mockRejectedValueOnce(new Error('redis is down'));

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

    expect(bus.publish).toHaveBeenCalledTimes(1);
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
    bus.publish.mockRejectedValueOnce(new Error('redis is down'));
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

    expect(bus.publish).not.toHaveBeenCalled();
    expect(prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', errorMessage: 'boom' }),
      }),
    );
    // SP3: a FAILED terminal also wakes the waiters (they re-read Postgres and see FAILED).
    expect(scanJobDone.publishDone).toHaveBeenCalledWith('job_1', 'FAILED');
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
    expect(bus.publish).not.toHaveBeenCalled();

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

  describe('credential injection', () => {
    // A minimal SHODAN scanner stub that declares requiresCredential.
    const shodanScanner: ScannerDefinition = {
      ...NmapScanner,
      name: 'shodan',
      requiresCredential: 'SHODAN',
      credentialEnvVar: 'SHODAN_API_KEY',
    };

    beforeEach(() => {
      registry.register(shodanScanner);
    });

    it('injects decrypted API key into docker.run env when credential exists', async () => {
      // Use a real SecretBox to produce a genuine sealed ciphertext so the
      // open() call exercises the actual crypto path through the mock.
      const masterKey = Buffer.alloc(32, 0xab).toString('base64');
      const realBox = new SecretBox(masterKey);
      const ciphertext = realBox.seal('KEY123');

      (prisma.engagement.findUnique as jest.Mock).mockResolvedValueOnce({ ownerId: 'u1' });
      (prisma.apiCredential.findUnique as jest.Mock).mockResolvedValueOnce({ ciphertext });
      secretBox.open.mockReturnValueOnce('KEY123');

      await processor.process(
        job({
          scanJobId: 'job_1',
          scannerName: 'shodan',
          target: '127.0.0.1',
          input: {},
          engagementId: 'eng_1',
        }),
      );

      expect(secretBox.open).toHaveBeenCalledWith(ciphertext);
      expect(docker.run).toHaveBeenCalledWith(
        expect.objectContaining({
          env: expect.objectContaining({ SHODAN_API_KEY: 'KEY123' }),
        }),
      );
    });

    it('marks ScanJob FAILED and does NOT run the container when credential is missing', async () => {
      (prisma.engagement.findUnique as jest.Mock).mockResolvedValueOnce({ ownerId: 'u1' });
      (prisma.apiCredential.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        processor.process(
          job({
            scanJobId: 'job_1',
            scannerName: 'shodan',
            target: '127.0.0.1',
            input: {},
            engagementId: 'eng_1',
          }),
        ),
      ).rejects.toThrow(/missing SHODAN/);

      expect(docker.run).not.toHaveBeenCalled();
      expect(prisma.scanJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job_1' },
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: expect.stringMatching(/missing.*SHODAN.*API credential/),
          }),
        }),
      );
    });

    it('does NOT look up engagement or credentials for scanners without requiresCredential', async () => {
      // nmap has no requiresCredential — the existing happy-path test also
      // covers this, but we assert here that the prisma methods are never
      // touched so that a future change cannot silently add lookups.
      await processor.process(
        job({
          scanJobId: 'job_1',
          scannerName: 'nmap',
          target: '127.0.0.1',
          input: { ports: '1-100' },
          engagementId: 'eng_1',
        }),
      );

      expect(prisma.engagement.findUnique).not.toHaveBeenCalled();
      expect(prisma.apiCredential.findUnique).not.toHaveBeenCalled();
      expect(docker.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('file capture (binary artifact)', () => {
    // A minimal scanner stub with BINARY file capture (e.g. gowitness).
    const binaryScanner: ScannerDefinition = {
      ...NmapScanner,
      name: 'gowitness',
      displayName: 'gowitness (screenshot)',
      requiresCredential: undefined,
      credentialEnvVar: undefined,
      outputs: [{ format: 'BINARY', capture: { path: '' }, parser: 'noop' }],
      build: jest.fn((_input, _target, ctx) => ({
        cmd: ['sh', '-lc', `gowitness single 'example.com' --screenshot-path ${ctx.scratchDir}`],
        binds: [],
      })),
    };

    // Fake PNG magic bytes
    const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    beforeEach(() => {
      registry.register(binaryScanner);

      // Reset the build mock so call tracking is fresh each test
      (binaryScanner.build as jest.Mock).mockClear();
      (binaryScanner.build as jest.Mock).mockImplementation((_input, _target, ctx) => ({
        cmd: ['sh', '-lc', `gowitness single 'example.com' --screenshot-path ${ctx.scratchDir}`],
        binds: [],
      }));

      // Docker mock that writes a fake PNG into the bound host dir
      docker.run.mockImplementation(async (spec: RunSpec): Promise<RunResult> => {
        // Find the /output bind and write shot.png into the host src dir
        const outputBind = spec.binds?.find((b) => b.dst === '/output');
        if (outputBind) {
          fs.writeFileSync(join(outputBind.src, 'shot.png'), FAKE_PNG);
        }
        spec.onStdout?.('some stdout noise');
        return {
          exitCode: 0,
          durationMs: 500,
          containerId: 'c_gowitness',
          timedOut: false,
          killedByUser: false,
        };
      });
    });

    const binaryJob = () =>
      job({
        scanJobId: 'job_1',
        scannerName: 'gowitness',
        target: 'example.com',
        input: {},
        engagementId: 'eng_1',
      });

    it('calls scanner.build with scratchDir === /output (not /tmp)', async () => {
      await processor.process(binaryJob());
      expect(binaryScanner.build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ scratchDir: '/output' }),
      );
    });

    it('passes a bind with dst === /output to docker.run', async () => {
      await processor.process(binaryJob());
      const runCall = (docker.run as jest.Mock).mock.calls[0][0] as RunSpec;
      const outputBind = runCall.binds?.find((b: { dst: string }) => b.dst === '/output');
      expect(outputBind).toBeDefined();
      expect(outputBind?.src).toBeTruthy(); // real host path, not empty
    });

    it('stores the produced PNG with content-type image/png and the correct bytes', async () => {
      await processor.process(binaryJob());
      expect(storage.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'raw-outputs',
          body: FAKE_PNG,
          contentType: 'image/png',
        }),
      );
    });

    it('does NOT enqueue a parse job for BINARY format', async () => {
      await processor.process(binaryJob());
      expect(bus.publish).not.toHaveBeenCalled();
    });

    it('marks the job COMPLETED with a rawOutputKey', async () => {
      await processor.process(binaryJob());
      expect(prisma.scanJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job_1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            rawOutputKey: expect.stringContaining('gowitness'),
          }),
        }),
      );
    });

    it('marks job FAILED with "no artifact" message when docker writes no file', async () => {
      // Override: docker run produces no file
      docker.run.mockImplementationOnce(
        async (): Promise<RunResult> => ({
          exitCode: 0,
          durationMs: 100,
          containerId: 'c_empty',
          timedOut: false,
          killedByUser: false,
        }),
      );

      await expect(processor.process(binaryJob())).rejects.toThrow(/no artifact/);

      expect(prisma.scanJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job_1' },
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: expect.stringMatching(/no artifact/),
          }),
        }),
      );
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
    });

    it('cleans up the host temp dir after successful processing', async () => {
      let capturedHostDir: string | undefined;
      docker.run.mockImplementationOnce(async (spec: RunSpec): Promise<RunResult> => {
        const outputBind = spec.binds?.find((b) => b.dst === '/output');
        if (outputBind) {
          capturedHostDir = outputBind.src;
          fs.writeFileSync(join(outputBind.src, 'shot.png'), FAKE_PNG);
        }
        return {
          exitCode: 0,
          durationMs: 100,
          containerId: 'c_cleanup',
          timedOut: false,
          killedByUser: false,
        };
      });

      await processor.process(binaryJob());

      // The host dir must have been removed by the finally block
      expect(capturedHostDir).toBeDefined();
      expect(fs.existsSync(capturedHostDir!)).toBe(false);
    });

    it('cleans up the host temp dir even when docker.run rejects', async () => {
      let lastBindSrc: string | undefined;

      docker.run.mockImplementationOnce(async (spec: RunSpec): Promise<RunResult> => {
        // Capture the bound host path before throwing so we can assert cleanup afterward.
        lastBindSrc = spec.binds?.find((b) => b.dst === '/output')?.src;
        throw new Error('docker.run kaboom');
      });

      await expect(processor.process(binaryJob())).rejects.toThrow('docker.run kaboom');

      // The temp dir must have been removed by the outer finally even though
      // docker.run threw before any file was written.
      expect(lastBindSrc).toBeDefined();
      expect(fs.existsSync(lastBindSrc!)).toBe(false);
    });
  });
});

describe('deriveScanStatus', () => {
  it('returns QUEUED for a scan with no jobs', () => {
    expect(deriveScanStatus([])).toBe('QUEUED');
  });

  it('returns QUEUED while all jobs are still pending/queued', () => {
    expect(deriveScanStatus(['QUEUED'])).toBe('QUEUED');
    expect(deriveScanStatus(['PENDING', 'QUEUED'])).toBe('QUEUED');
  });

  it('returns RUNNING once any job has started', () => {
    expect(deriveScanStatus(['RUNNING'])).toBe('RUNNING');
    expect(deriveScanStatus(['QUEUED', 'RUNNING'])).toBe('RUNNING');
  });

  it('returns RUNNING when some jobs are terminal but others are still pending', () => {
    expect(deriveScanStatus(['COMPLETED', 'QUEUED'])).toBe('RUNNING');
  });

  it('returns COMPLETED only when every job completed', () => {
    expect(deriveScanStatus(['COMPLETED'])).toBe('COMPLETED');
    expect(deriveScanStatus(['COMPLETED', 'COMPLETED'])).toBe('COMPLETED');
  });

  it('applies worst-outcome-wins across terminal jobs', () => {
    expect(deriveScanStatus(['COMPLETED', 'FAILED'])).toBe('FAILED');
    expect(deriveScanStatus(['COMPLETED', 'TIMEOUT'])).toBe('TIMEOUT');
    expect(deriveScanStatus(['COMPLETED', 'CANCELLED'])).toBe('CANCELLED');
    expect(deriveScanStatus(['FAILED', 'TIMEOUT', 'CANCELLED'])).toBe('FAILED');
  });
});
