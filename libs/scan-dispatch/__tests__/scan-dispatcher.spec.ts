import type { PrismaService } from '@autoscanner/database';
import type { ScannerRegistry } from '@autoscanner/scanner-sdk';

import { ScanDispatcher, type DispatchItem } from '../src/scan-dispatcher.service';
import type { ScanDispatchRedisSubscriber } from '../src/scan-dispatch.tokens';

type ScanJobRow = { id: string; status: string; errorMessage?: string | null } | null;

interface Harness {
  dispatcher: ScanDispatcher;
  prisma: {
    $transaction: jest.Mock;
    scan: { create: jest.Mock; update: jest.Mock };
    scanJob: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  bus: { publish: jest.Mock };
  registry: { get: jest.Mock };
  subscriber: {
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
    on: jest.Mock;
    quit: jest.Mock;
  };
}

/**
 * Builds a ScanDispatcher wired to controllable mocks. `findUnique` is driven
 * by the supplied resolver so tests can branch on the queried scanJob id.
 */
function makeHarness(
  findUnique: (where: { id: string }) => ScanJobRow,
  opts?: { scanId?: string; enqueueRejects?: boolean },
): Harness {
  const scanId = opts?.scanId ?? 'scan1';

  const txClient = {
    scan: { create: jest.fn().mockResolvedValue({ id: scanId }) },
    scanJob: { create: jest.fn().mockResolvedValue({ id: 'ignored' }) },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient)),
    scan: { create: txClient.scan.create, update: jest.fn().mockResolvedValue({}) },
    scanJob: {
      create: txClient.scanJob.create,
      findUnique: jest.fn(async (args: { where: { id: string } }) => findUnique(args.where)),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const bus = {
    publish: opts?.enqueueRejects
      ? jest.fn().mockRejectedValue(new Error('redis down'))
      : jest.fn().mockResolvedValue(undefined),
  };

  const registry = { get: jest.fn(() => ({ docker: { defaultTimeoutMs: 1000 } })) };

  const subscriber = {
    subscribe: jest.fn().mockResolvedValue(0),
    unsubscribe: jest.fn().mockResolvedValue(0),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(0),
  };

  const dispatcher = new ScanDispatcher(
    prisma as unknown as PrismaService,
    registry as unknown as ScannerRegistry,
    bus,
    subscriber as unknown as ScanDispatchRedisSubscriber,
    { pollIntervalMs: 5 },
  );

  return { dispatcher, prisma, bus, registry, subscriber };
}

const baseItem = (over: Partial<DispatchItem> = {}): DispatchItem => ({
  engagementId: 'eng1',
  createdById: 'user1',
  scannerName: 'nmap',
  target: '1.2.3.4',
  input: { foo: 'bar' },
  aiRunId: 'run1',
  aiRunNodeId: 'node1',
  ...over,
});

describe('ScanDispatcher', () => {
  it('resolves COMPLETED and enqueues the scan job', async () => {
    const h = makeHarness(() => ({ id: 'x', status: 'COMPLETED' }));

    const results = await h.dispatcher.dispatchMany([baseItem()]);

    expect(results).toEqual([
      {
        scanId: 'scan1',
        scanJobId: expect.any(String),
        status: 'COMPLETED',
        errorMessage: undefined,
      },
    ]);
    // scan.create received the AI run linkage.
    expect(h.prisma.scan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiRunId: 'run1', aiRunNodeId: 'node1' }),
      }),
    );
    expect(h.bus.publish).toHaveBeenCalledTimes(1);
  });

  it('resolves FAILED with errorMessage and does not throw', async () => {
    const h = makeHarness(() => ({ id: 'x', status: 'FAILED', errorMessage: 'boom' }));

    const results = await h.dispatcher.dispatchMany([baseItem()]);

    expect(results[0]).toMatchObject({ scanId: 'scan1', status: 'FAILED', errorMessage: 'boom' });
  });

  it('settles each item independently, preserving input order', async () => {
    // Branch on the queried scanJob id: first-created id -> COMPLETED, other -> FAILED.
    let firstId: string | null = null;
    const h = makeHarness((where) => {
      if (firstId === null) firstId = where.id;
      const status = where.id === firstId ? 'COMPLETED' : 'FAILED';
      return { id: where.id, status, errorMessage: status === 'FAILED' ? 'nope' : null };
    });

    const results = await h.dispatcher.dispatchMany([
      baseItem({ scannerName: 'a' }),
      baseItem({ scannerName: 'b' }),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('COMPLETED');
    expect(results[1].status).toBe('FAILED');
    expect(results[1].errorMessage).toBe('nope');
  });

  it('settles on the scanjob:done PUSH without waiting for the fallback poll (SP3)', async () => {
    // A 60s fallback poll would never fire inside this test — so if the dispatch resolves, it
    // resolved because the push handler drove checkOnce (proving push is the primary path).
    const h = makeHarness(() => ({ id: 'x', status: 'COMPLETED' }), {});
    const dispatcher = new ScanDispatcher(
      h.prisma as never,
      h.registry as never,
      h.bus as never,
      h.subscriber as never,
      { pollIntervalMs: 60_000 },
    );

    const pending = dispatcher.dispatchMany([baseItem()]);

    // Let dispatchOne subscribe + create the rows and register its channel handler.
    await new Promise((r) => setImmediate(r));
    const messageHandler = h.subscriber.on.mock.calls[0][1] as (ch: string, msg: string) => void;
    const channel = h.subscriber.subscribe.mock.calls[0][0] as string;
    expect(channel).toMatch(/^scanjob:done:/);

    // Fire the push scan-worker now sends.
    messageHandler(channel, JSON.stringify({ scanJobId: 'x', status: 'COMPLETED' }));

    const results = await pending;
    expect(results[0].status).toBe('COMPLETED');
  });

  it('reconciles both rows to FAILED when enqueue rejects', async () => {
    const h = makeHarness(() => ({ id: 'x', status: 'COMPLETED' }), { enqueueRejects: true });

    const results = await h.dispatcher.dispatchMany([baseItem()]);

    expect(results[0].status).toBe('FAILED');
    expect(h.prisma.scan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(h.prisma.scanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});
