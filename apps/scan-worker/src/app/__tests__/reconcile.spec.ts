import type { PrismaService } from '@autoscanner/database';

import { reconcileRunningScanJobs } from '../reconcile';

const silentLogger = {
  log: jest.fn(),
  warn: jest.fn(),
};

describe('reconcileRunningScanJobs', () => {
  it('returns 0 and does not enqueue when no RUNNING rows', async () => {
    const prisma = {
      scanJob: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const bus = { publish: jest.fn() };

    const n = await reconcileRunningScanJobs(prisma, bus, silentLogger);

    expect(n).toBe(0);
    expect(bus.publish).not.toHaveBeenCalled();
    expect((prisma.scanJob.findMany as jest.Mock).mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { status: 'RUNNING' } }),
    );
  });

  it('re-enqueues every RUNNING ScanJob to the scanner topic with flattened engagementId', async () => {
    const prisma = {
      scanJob: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'j1',
            scannerName: 'nmap',
            target: '127.0.0.1',
            input: { ports: '1-100' },
            scan: { engagementId: 'e1' },
          },
          {
            id: 'j2',
            scannerName: 'subfinder',
            target: 'example.com',
            input: {},
            scan: { engagementId: 'e2' },
          },
        ]),
      },
    } as unknown as PrismaService;
    const bus = { publish: jest.fn().mockResolvedValue(undefined) };

    const n = await reconcileRunningScanJobs(prisma, bus, silentLogger);

    expect(n).toBe(2);
    expect(bus.publish).toHaveBeenCalledTimes(2);
    expect(bus.publish).toHaveBeenNthCalledWith(1, 'security.scanner.requested', 'j1', {
      scanJobId: 'j1',
      scannerName: 'nmap',
      target: '127.0.0.1',
      input: { ports: '1-100' },
      engagementId: 'e1',
    });
    expect(bus.publish).toHaveBeenNthCalledWith(2, 'security.scanner.requested', 'j2', {
      scanJobId: 'j2',
      scannerName: 'subfinder',
      target: 'example.com',
      input: {},
      engagementId: 'e2',
    });
  });

  it('logs a warning but continues when a single re-enqueue fails', async () => {
    const prisma = {
      scanJob: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'j1',
            scannerName: 'nmap',
            target: '127.0.0.1',
            input: {},
            scan: { engagementId: 'e1' },
          },
          {
            id: 'j2',
            scannerName: 'nmap',
            target: '10.0.0.1',
            input: {},
            scan: { engagementId: 'e2' },
          },
        ]),
      },
    } as unknown as PrismaService;
    const warn = jest.fn();
    const bus = {
      publish: jest
        .fn()
        .mockRejectedValueOnce(new Error('redis down'))
        .mockResolvedValueOnce(undefined),
    };

    const n = await reconcileRunningScanJobs(prisma, bus, { log: jest.fn(), warn });

    expect(n).toBe(2);
    expect(bus.publish).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to re-enqueue.*j1.*redis down/),
    );
  });
});
