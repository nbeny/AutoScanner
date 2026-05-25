import type { Queue } from 'bullmq';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { NmapScanner } from '@autoscanner/scanners-nmap';
import type { PrismaService } from '@autoscanner/database';
import type { ScanJobPayload } from '@autoscanner/queues';
import { ValidationError, NotFoundError } from '@autoscanner/common';
import type { ObjectStorage } from '@autoscanner/storage';

import { ScansService } from '../scans.service';

describe('ScansService.runScan', () => {
  let prisma: jest.Mocked<PrismaService>;
  let scanQueue: jest.Mocked<Queue<ScanJobPayload>>;
  let storage: jest.Mocked<ObjectStorage>;
  let registry: ScannerRegistry;
  let svc: ScansService;

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
        })),
        findFirst: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    scanQueue = { add: jest.fn().mockResolvedValue({ id: 'bull_1' }) } as unknown as jest.Mocked<
      Queue<ScanJobPayload>
    >;

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

    svc = new ScansService(prisma, registry, scanQueue, storage);
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
    expect(scanQueue.add).toHaveBeenCalledWith(
      'scan',
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

  it('rejects unknown scanner', async () => {
    await expect(
      svc.runScan(userId, { engagementId, scannerName: 'does-not-exist', target: '127.0.0.1' }),
    ).rejects.toThrow(/does-not-exist/);

    expect(prisma.scan.create).not.toHaveBeenCalled();
    expect(scanQueue.add).not.toHaveBeenCalled();
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

    expect(scanQueue.add).not.toHaveBeenCalled();
  });

  it('rejects engagement the user does not own', async () => {
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      svc.runScan('other_user', { engagementId, scannerName: 'nmap', target: '127.0.0.1' }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(scanQueue.add).not.toHaveBeenCalled();
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
});
