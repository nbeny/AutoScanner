import type { Job, Queue } from 'bullmq';
import type { PrismaService } from '@autoscanner/database';
import type { DockerRunner, RunResult, RunSpec } from '@autoscanner/docker-runner';
import type { ParseJobPayload, ScanJobPayload } from '@autoscanner/queues';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { NmapScanner } from '@autoscanner/scanners-nmap';
import type { ObjectStorage } from '@autoscanner/storage';

import { ScanJobProcessor } from '../scan-job.processor';

const NMAP_XML =
  '<?xml version="1.0"?><nmaprun><host><address addr="127.0.0.1" addrtype="ipv4"/></host></nmaprun>';

describe('ScanJobProcessor', () => {
  let prisma: jest.Mocked<PrismaService>;
  let docker: jest.Mocked<DockerRunner>;
  let storage: jest.Mocked<ObjectStorage>;
  let parseQueue: jest.Mocked<Queue<ParseJobPayload>>;
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

    registry = new ScannerRegistry();
    registry.register(NmapScanner);

    processor = new ScanJobProcessor(prisma, registry, docker, storage, parseQueue);
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
});
