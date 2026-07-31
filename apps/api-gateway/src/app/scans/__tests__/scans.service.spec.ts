import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { NmapScanner } from '@autoscanner/scanners-nmap';
import type { PrismaService } from '@autoscanner/database';
import { ValidationError, NotFoundError } from '@autoscanner/common';
import type { ObjectStorage } from '@autoscanner/storage';

import { ScansService } from '../scans.service';

describe('ScansService.runScan', () => {
  let prisma: jest.Mocked<PrismaService>;
  let bus: { publish: jest.Mock };
  let storage: jest.Mocked<ObjectStorage>;
  let registry: ScannerRegistry;
  let svc: ScansService;
  let scanControl: { publishCancel: jest.Mock };
  let events: { publish: jest.Mock };

  const userId = 'user_1';
  const engagementId = 'eng_1';

  beforeEach(() => {
    prisma = {
      engagement: {
        findFirst: jest.fn().mockResolvedValue({ id: engagementId, ownerId: userId }),
      },
      scan: {
        create: jest.fn(async ({ data }) => ({
          id: 'scan_1',
          engagementId: data.engagementId,
          createdById: data.createdById,
          name: data.name ?? null,
          status: 'QUEUED',
          createdAt: new Date(),
          completedAt: null,
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      scanJob: {
        create: jest.fn(async ({ data }) => ({
          id: 'job_1',
          scanId: data.scanId,
          scannerName: data.scannerName,
          target: data.target,
          input: data.input,
          status: 'QUEUED',
          queuedAt: new Date(),
          createdAt: new Date(),
          agentId: data.agentId ?? null,
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        findFirst: jest.fn(),
      },
      agent: {
        findFirst: jest.fn(),
      },
      // Callback form: invoke the callback with `prisma` itself as the tx
      // client so nested .scan.create / .scanJob.create resolve via the
      // mocks above.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    } as unknown as jest.Mocked<PrismaService>;

    bus = { publish: jest.fn().mockResolvedValue(undefined) };

    storage = {
      ensureBucket: jest.fn(),
      putObject: jest.fn(),
      getObject: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn(),
      presignGetUrl: jest.fn(),
      presignPutUrl: jest.fn(),
    } as unknown as jest.Mocked<ObjectStorage>;

    registry = new ScannerRegistry();
    registry.register(NmapScanner);

    scanControl = { publishCancel: jest.fn() };
    events = { publish: jest.fn() };

    const capabilities = { has: jest.fn().mockResolvedValue(true) };
    svc = new ScansService(
      prisma,
      registry,
      bus,
      storage,
      scanControl as any,
      events as any,
      capabilities as any,
    );
  });

  it('creates Scan + ScanJob, enqueues payload, returns Scan', async () => {
    const scan = await svc.runScan(userId, {
      engagementId,
      scannerName: 'nmap',
      target: '127.0.0.1',
      optionsJson: JSON.stringify({ ports: '1-100' }),
    });

    expect(prisma.scan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ engagementId, createdById: userId, status: 'QUEUED' }),
      }),
    );
    expect(prisma.scanJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scanId: 'scan_1',
          scannerName: 'nmap',
          target: '127.0.0.1',
          status: 'QUEUED',
        }),
      }),
    );
    expect(bus.publish).toHaveBeenCalledWith(
      'security.scanner.requested',
      'job_1',
      expect.objectContaining({
        scanJobId: 'job_1',
        scannerName: 'nmap',
        target: '127.0.0.1',
        engagementId,
        input: expect.objectContaining({ ports: '1-100' }),
      }),
    );
    expect(scan.id).toBe('scan_1');
  });

  it('wraps Scan + ScanJob creation in a single $transaction', async () => {
    await svc.runScan(userId, {
      engagementId,
      scannerName: 'nmap',
      target: '127.0.0.1',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Both create calls happened inside the tx callback (we proxied tx=prisma).
    expect(prisma.scan.create).toHaveBeenCalledTimes(1);
    expect(prisma.scanJob.create).toHaveBeenCalledTimes(1);
  });

  it('marks both Scan and ScanJob FAILED when the publish throws and re-throws the error', async () => {
    const enqueueError = new Error('redis is down');
    (bus.publish as jest.Mock).mockRejectedValueOnce(enqueueError);

    await expect(
      svc.runScan(userId, { engagementId, scannerName: 'nmap', target: '127.0.0.1' }),
    ).rejects.toBe(enqueueError);

    expect(prisma.scan.update).toHaveBeenCalledWith({
      where: { id: 'scan_1' },
      data: { status: 'FAILED' },
    });
    expect(prisma.scanJob.update).toHaveBeenCalledWith({
      where: { id: 'job_1' },
      data: { status: 'FAILED', errorMessage: 'enqueue failed: redis is down' },
    });
  });

  it('still re-throws the enqueue error even if the FAILED status update itself fails', async () => {
    (bus.publish as jest.Mock).mockRejectedValueOnce(new Error('redis is down'));
    (prisma.scan.update as jest.Mock).mockRejectedValueOnce(new Error('db is down'));
    (prisma.scanJob.update as jest.Mock).mockRejectedValueOnce(new Error('db is down'));

    // Verify the masked update failures surface as warns. Without those,
    // an operator hit by Redis-down + DB-flake at once would only see the
    // BullMQ error and never know the DB row was never reconciled.
    const warnSpy = jest
      .spyOn((svc as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      svc.runScan(userId, { engagementId, scannerName: 'nmap', target: '127.0.0.1' }),
    ).rejects.toThrow(/redis is down/);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/scan=.*FAILED-status reconciliation failed.*db is down/),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/scanJob=.*FAILED-status reconciliation failed.*db is down/),
    );
  });

  it('rejects unknown scanner', async () => {
    await expect(
      svc.runScan(userId, { engagementId, scannerName: 'does-not-exist', target: '127.0.0.1' }),
    ).rejects.toThrow(/does-not-exist/);

    expect(prisma.scan.create).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('rejects malformed optionsJson', async () => {
    await expect(
      svc.runScan(userId, {
        engagementId,
        scannerName: 'nmap',
        target: '127.0.0.1',
        optionsJson: '{not-json',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('rejects engagement the user does not own', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      svc.runScan('other_user', { engagementId, scannerName: 'nmap', target: '127.0.0.1' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('rejects options that fail the scanner zod schema', async () => {
    await expect(
      svc.runScan(userId, {
        engagementId,
        scannerName: 'nmap',
        target: '127.0.0.1',
        optionsJson: JSON.stringify({ timingTemplate: 99 }),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  describe('agent-routed scans', () => {
    const agentId = 'agent_1';
    const activeAgent = { id: agentId, createdById: userId, status: 'ACTIVE' };

    it('creates ScanJob with agentId and does NOT enqueue when agentId is set', async () => {
      (prisma.agent.findFirst as jest.Mock).mockResolvedValueOnce(activeAgent);

      const scan = await svc.runScan(userId, {
        engagementId,
        scannerName: 'nmap',
        target: '127.0.0.1',
        agentId,
      });

      expect(prisma.agent.findFirst).toHaveBeenCalledWith({
        where: { id: agentId, createdById: userId, status: { in: ['ACTIVE', 'IDLE'] } },
      });
      expect(prisma.scanJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId }),
        }),
      );
      expect(bus.publish).not.toHaveBeenCalled();
      expect(scan.id).toBe('scan_1');
    });

    it('throws NotFoundError and creates no scan when the agent is not found or not owned', async () => {
      (prisma.agent.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        svc.runScan(userId, {
          engagementId,
          scannerName: 'nmap',
          target: '127.0.0.1',
          agentId,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      expect(prisma.scan.create).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
    });
  });

  it('listAllForOwner filters by owner and status across engagements', async () => {
    (prisma as any).scan = {
      ...(prisma as any).scan,
      findMany: jest.fn().mockResolvedValue([{ id: 's1' }]),
    };
    const res = await svc.listAllForOwner(userId, {
      status: 'RUNNING' as any,
      limit: 10,
      offset: 0,
    });
    expect((prisma as any).scan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'RUNNING',
          engagement: { ownerId: userId, deletedAt: null },
        }),
        include: { jobs: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      }),
    );
    expect(res).toEqual([{ id: 's1' }]);
  });

  it('countFindingsForJob returns the prisma finding count', async () => {
    (prisma as any).finding = { count: jest.fn().mockResolvedValue(3) };
    const n = await svc.countFindingsForJob('job_1');
    expect((prisma as any).finding.count).toHaveBeenCalledWith({ where: { scanJobId: 'job_1' } });
    expect(n).toBe(3);
  });

  describe('getRawOutputPresignedUrl', () => {
    const scanJobId = 'job_1';
    const rawKey = 'eng_1/scan_1/job_1/nmap-xml.xml';

    it('returns a presigned URL when the job is owned and has a raw output', async () => {
      (prisma.scanJob.findFirst as jest.Mock).mockResolvedValueOnce({
        id: scanJobId,
        rawOutputKey: rawKey,
      });
      (storage.presignGetUrl as jest.Mock).mockResolvedValueOnce(
        'https://minio.local/raw-outputs/' + rawKey + '?sig=abc',
      );

      const result = await svc.getRawOutputPresignedUrl(userId, scanJobId);

      expect(prisma.scanJob.findFirst).toHaveBeenCalledWith({
        where: {
          id: scanJobId,
          scan: { engagement: { ownerId: userId, deletedAt: null } },
        },
        select: { id: true, rawOutputKey: true },
      });
      expect(storage.presignGetUrl).toHaveBeenCalledWith({
        bucket: 'raw-outputs',
        key: rawKey,
        expiresInSeconds: 3600,
      });
      expect(result).toEqual({
        url: 'https://minio.local/raw-outputs/' + rawKey + '?sig=abc',
        key: rawKey,
        expiresInSeconds: 3600,
      });
    });

    it('throws NotFoundError when the scan job does not belong to the user', async () => {
      (prisma.scanJob.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(svc.getRawOutputPresignedUrl(userId, scanJobId)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(storage.presignGetUrl).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when rawOutputKey has not been set yet', async () => {
      (prisma.scanJob.findFirst as jest.Mock).mockResolvedValueOnce({
        id: scanJobId,
        rawOutputKey: null,
      });

      await expect(svc.getRawOutputPresignedUrl(userId, scanJobId)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(storage.presignGetUrl).not.toHaveBeenCalled();
    });
  });

  it('retryScanJob re-runs with the original job params', async () => {
    const job = {
      id: 'job_1',
      scannerName: 'nmap',
      target: '127.0.0.1',
      input: { ports: '1-1024' },
      scan: { engagementId: 'e1', engagement: { ownerId: userId } },
    };
    (prisma as any).scanJob = { findFirst: jest.fn().mockResolvedValue(job) };
    const spy = jest.spyOn(svc, 'runScan').mockResolvedValue({ id: 's2' } as any);
    const res = await svc.retryScanJob(userId, 'job_1');
    expect(spy).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ engagementId: 'e1', scannerName: 'nmap', target: '127.0.0.1' }),
    );
    expect(res).toEqual({ id: 's2' });
  });

  describe('cancelScanJob', () => {
    it('cancelScanJob removes a queued job, sets CANCELLED and emits event', async () => {
      const job = {
        id: 'job_1',
        scanId: 's1',
        status: 'QUEUED',
        scan: { engagementId: 'e1', engagement: { ownerId: userId } },
      };
      (prisma as any).scanJob = {
        findFirst: jest.fn().mockResolvedValue(job),
        update: jest.fn().mockResolvedValue({ ...job, status: 'CANCELLED' }),
      };
      await svc.cancelScanJob(userId, 'job_1');
      // A published Kafka message cannot be un-published: cancellation marks the row
      // CANCELLED (asserted below) and the scan-worker's terminal-status guard skips it.
      expect((prisma as any).scanJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job_1' },
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
      expect(scanControl.publishCancel).toHaveBeenCalledWith('job_1');
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'SCAN_JOB_STATUS_CHANGED',
          engagementId: 'e1',
          scanJobId: 'job_1',
        }),
      );
    });

    it('cancelScanJob is a no-op for an already terminal job', async () => {
      const job = {
        id: 'job_x',
        scanId: 's1',
        status: 'COMPLETED',
        scan: { engagementId: 'e1', engagement: { ownerId: userId } },
      };
      (prisma as any).scanJob = { findFirst: jest.fn().mockResolvedValue(job), update: jest.fn() };
      await svc.cancelScanJob(userId, 'job_x');
      expect((prisma as any).scanJob.update).not.toHaveBeenCalled();
    });
  });
});
