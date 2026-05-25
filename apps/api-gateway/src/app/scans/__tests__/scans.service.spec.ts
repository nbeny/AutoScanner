import type { Queue } from 'bullmq';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { NmapScanner } from '@autoscanner/scanners-nmap';
import type { PrismaService } from '@autoscanner/database';
import type { ScanJobPayload } from '@autoscanner/queues';
import { ValidationError, NotFoundError } from '@autoscanner/common';

import { ScansService } from '../scans.service';

describe('ScansService.runScan', () => {
  let prisma: jest.Mocked<PrismaService>;
  let scanQueue: jest.Mocked<Queue<ScanJobPayload>>;
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
      },
    } as unknown as jest.Mocked<PrismaService>;

    scanQueue = { add: jest.fn().mockResolvedValue({ id: 'bull_1' }) } as unknown as jest.Mocked<
      Queue<ScanJobPayload>
    >;

    registry = new ScannerRegistry();
    registry.register(NmapScanner);

    svc = new ScansService(prisma, registry, scanQueue);
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
});
