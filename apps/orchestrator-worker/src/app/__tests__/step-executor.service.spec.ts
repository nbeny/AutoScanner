import type { Queue } from 'bullmq';
import type { PrismaService } from '@autoscanner/database';
import type { ScanJobPayload } from '@autoscanner/queues';
import type { ScannerRegistry } from '@autoscanner/scanner-sdk';
import type { TemplateStep } from '@autoscanner/templates';

import { ContextBuilder } from '../context-builder.service';
import type { OrchestratorRedisSubscriber } from '../orchestrator-redis.tokens';
import { StepExecutor, StepTimeoutError, StepFailedError } from '../step-executor.service';

type TemplateRun = {
  id: string;
  templateId: string;
  templateName: string;
  engagementId: string;
  target: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  currentStepIndex: number;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

function makeRun(overrides: Partial<TemplateRun> = {}): TemplateRun {
  return {
    id: 'run_1',
    templateId: 'tpl_1',
    templateName: 'recon-passive',
    engagementId: 'eng_1',
    target: 'example.com',
    status: 'RUNNING',
    currentStepIndex: 0,
    startedAt: new Date(),
    completedAt: null,
    errorMessage: null,
    createdById: 'user_1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma(): jest.Mocked<PrismaService> {
  return {
    subdomain: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ipAddress: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    scan: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'scan_1', ...data }),
        ),
    },
    scanJob: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'scanjob_1', status: 'PENDING', ...data }),
        ),
      findUnique: jest.fn().mockResolvedValue({ id: 'scanjob_1', status: 'PENDING' }),
    },
  } as unknown as jest.Mocked<PrismaService>;
}

function makeRedis(): jest.Mocked<OrchestratorRedisSubscriber> {
  return {
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OrchestratorRedisSubscriber>;
}

function makeScannerRegistry(timeoutMs = 600_000): ScannerRegistry {
  return {
    get: jest.fn().mockReturnValue({
      name: 'subfinder',
      docker: { defaultTimeoutMs: timeoutMs },
    }),
  } as unknown as ScannerRegistry;
}

function makeScanQueue(): jest.Mocked<Queue<ScanJobPayload>> {
  return {
    add: jest.fn().mockResolvedValue({}),
  } as unknown as jest.Mocked<Queue<ScanJobPayload>>;
}

function build(
  prisma: jest.Mocked<PrismaService>,
  registry: ScannerRegistry,
  queue: jest.Mocked<Queue<ScanJobPayload>>,
  redis: jest.Mocked<OrchestratorRedisSubscriber>,
  pollIntervalMs = 5_000,
): StepExecutor {
  const ctxBuilder = new ContextBuilder(prisma);
  return new StepExecutor(prisma, registry, queue, redis, ctxBuilder, { pollIntervalMs });
}

describe('StepExecutor target resolution (via ContextBuilder)', () => {
  it('kind=context path=target -> [templateRun.target] (root domain)', async () => {
    const prisma = makePrisma();
    const ctx = new ContextBuilder(prisma);
    const run = makeRun({ target: 'acme.com' });
    const step: TemplateStep = {
      scannerName: 'subfinder',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    };

    const targets = await ctx.buildTargets(step, run, 0);

    expect(targets).toEqual(['acme.com']);
    expect(prisma.subdomain.findMany).not.toHaveBeenCalled();
  });

  it('kind=context path=subdomains -> canonicalValues from prisma.subdomain', async () => {
    const prisma = makePrisma();
    (prisma.subdomain.findMany as jest.Mock).mockResolvedValueOnce([
      { canonicalValue: 'api.acme.com' },
      { canonicalValue: 'mail.acme.com' },
    ]);
    const ctx = new ContextBuilder(prisma);
    const step: TemplateStep = {
      scannerName: 'httpx',
      inputs: {},
      target: { kind: 'context', path: 'subdomains' },
    };

    const targets = await ctx.buildTargets(step, makeRun({ engagementId: 'eng_xyz' }), 1);

    expect(prisma.subdomain.findMany).toHaveBeenCalledWith({
      where: { engagementId: 'eng_xyz' },
    });
    expect(targets).toEqual(['api.acme.com', 'mail.acme.com']);
  });

  it('kind=context path=urls -> host strings of Subdomain rows with httpStatus IS NOT NULL', async () => {
    const prisma = makePrisma();
    (prisma.subdomain.findMany as jest.Mock).mockResolvedValueOnce([
      { canonicalValue: 'www.acme.com', httpStatus: 200 },
    ]);
    const ctx = new ContextBuilder(prisma);
    const step: TemplateStep = {
      scannerName: 'somewhere',
      inputs: {},
      target: { kind: 'context', path: 'urls' },
    };

    const targets = await ctx.buildTargets(step, makeRun({ engagementId: 'eng_x' }), 2);

    expect(prisma.subdomain.findMany).toHaveBeenCalledWith({
      where: { engagementId: 'eng_x', httpStatus: { not: null } },
    });
    expect(targets).toEqual(['www.acme.com']);
  });

  it('kind=context path=ipAddresses -> addresses from prisma.ipAddress', async () => {
    const prisma = makePrisma();
    (prisma.ipAddress.findMany as jest.Mock).mockResolvedValueOnce([
      { address: '10.0.0.1' },
      { address: '10.0.0.2' },
    ]);
    const ctx = new ContextBuilder(prisma);
    const step: TemplateStep = {
      scannerName: 'nmap',
      inputs: {},
      target: { kind: 'context', path: 'ipAddresses' },
    };

    const targets = await ctx.buildTargets(step, makeRun({ engagementId: 'eng_q' }), 1);

    expect(prisma.ipAddress.findMany).toHaveBeenCalledWith({
      where: { engagementId: 'eng_q' },
    });
    expect(targets).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('D3 fallback: empty resolved list AND stepIndex > 0 -> [templateRun.target]', async () => {
    const prisma = makePrisma();
    (prisma.subdomain.findMany as jest.Mock).mockResolvedValueOnce([]);
    const ctx = new ContextBuilder(prisma);
    const step: TemplateStep = {
      scannerName: 'httpx',
      inputs: {},
      target: { kind: 'context', path: 'subdomains' },
    };

    const targets = await ctx.buildTargets(step, makeRun({ target: 'fallback.example.com' }), 2);

    expect(targets).toEqual(['fallback.example.com']);
  });

  it('D3 NOT applied on step 0: empty list at stepIndex=0 stays empty', async () => {
    const prisma = makePrisma();
    (prisma.subdomain.findMany as jest.Mock).mockResolvedValueOnce([]);
    const ctx = new ContextBuilder(prisma);
    const step: TemplateStep = {
      scannerName: 'httpx',
      inputs: {},
      target: { kind: 'context', path: 'subdomains' },
    };

    const targets = await ctx.buildTargets(step, makeRun({ target: 'whatever.com' }), 0);

    expect(targets).toEqual([]);
  });

  it('rejects kind=static for step.target (Phase 2 out-of-scope)', async () => {
    const prisma = makePrisma();
    const ctx = new ContextBuilder(prisma);
    const step: TemplateStep = {
      scannerName: 'foo',
      inputs: {},
      target: { kind: 'static', value: 'x' },
    };

    await expect(ctx.buildTargets(step, makeRun(), 0)).rejects.toThrow(/static.*step\.target/i);
  });
});

describe('StepExecutor.runStep — completion polling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('polling resolves when scanJob.status flips to COMPLETED on 2nd poll', async () => {
    const prisma = makePrisma();
    (prisma.subdomain.findMany as jest.Mock).mockResolvedValueOnce([]);
    const findUnique = prisma.scanJob.findUnique as jest.Mock;
    findUnique.mockResolvedValueOnce({ id: 'scanjob_1', status: 'RUNNING' });
    findUnique.mockResolvedValueOnce({ id: 'scanjob_1', status: 'COMPLETED' });

    const registry = makeScannerRegistry(60_000);
    const queue = makeScanQueue();
    const redis = makeRedis();
    const exec = build(prisma, registry, queue, redis, 5_000);

    const run = makeRun();
    const step: TemplateStep = {
      scannerName: 'subfinder',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    };

    const promise = exec.runStep({ templateRun: run, step, stepIndex: 0 });

    // microtask flush: enqueue ScanJob, subscribe, then schedule first poll
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // First poll @ t=5s -> still RUNNING
    await jest.advanceTimersByTimeAsync(5_000);
    // Second poll @ t=10s -> COMPLETED
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(promise).resolves.toBeUndefined();
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'scan',
      expect.objectContaining({
        scanJobId: 'scanjob_1',
        scannerName: 'subfinder',
        target: 'example.com',
        engagementId: 'eng_1',
      }),
    );
    expect(redis.subscribe).toHaveBeenCalled();
    expect(redis.unsubscribe).toHaveBeenCalled();
  });

  it('polling rejects with StepFailedError when status flips to FAILED', async () => {
    const prisma = makePrisma();
    const findUnique = prisma.scanJob.findUnique as jest.Mock;
    findUnique.mockResolvedValueOnce({ id: 'scanjob_1', status: 'RUNNING' });
    findUnique.mockResolvedValueOnce({
      id: 'scanjob_1',
      status: 'FAILED',
      errorMessage: 'docker boom',
    });

    const exec = build(
      makePrisma_(prisma),
      makeScannerRegistry(60_000),
      makeScanQueue(),
      makeRedis(),
      5_000,
    );

    const run = makeRun();
    const step: TemplateStep = {
      scannerName: 'subfinder',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    };

    const promise = exec.runStep({ templateRun: run, step, stepIndex: 0 });
    // Make rejection observable to avoid unhandled promise rejection warnings
    const observed = promise.catch((err: unknown) => err);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5_000);
    await jest.advanceTimersByTimeAsync(5_000);

    const err = await observed;
    expect(err).toBeInstanceOf(StepFailedError);
    expect((err as StepFailedError).message).toMatch(/FAILED/);
  });

  it('polling rejects with StepTimeoutError when status never flips (timeout = defaultTimeoutMs + 60s)', async () => {
    const prisma = makePrisma();
    // Always RUNNING — never flips.
    (prisma.scanJob.findUnique as jest.Mock).mockResolvedValue({
      id: 'scanjob_1',
      status: 'RUNNING',
    });

    const registry = makeScannerRegistry(60_000); // step timeout = 60_000 + 60_000 = 120_000
    const exec = build(prisma, registry, makeScanQueue(), makeRedis(), 5_000);

    const run = makeRun();
    const step: TemplateStep = {
      scannerName: 'subfinder',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    };

    const promise = exec.runStep({ templateRun: run, step, stepIndex: 0 });
    const observed = promise.catch((err: unknown) => err);

    // flush microtasks then run past the 120s budget
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(120_000 + 1);

    const err = await observed;
    expect(err).toBeInstanceOf(StepTimeoutError);
  });
});

describe('StepExecutor.runStep — multi-target enqueue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('enqueues N ScanJobs (one per target) and waits for all to complete', async () => {
    const prisma = makePrisma();
    (prisma.subdomain.findMany as jest.Mock).mockResolvedValueOnce([
      { canonicalValue: 'a.acme.com' },
      { canonicalValue: 'b.acme.com' },
    ]);

    let createCount = 0;
    (prisma.scanJob.create as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        createCount += 1;
        return Promise.resolve({ id: `scanjob_${createCount}`, status: 'PENDING', ...data });
      },
    );
    // Both jobs report COMPLETED on first poll
    (prisma.scanJob.findUnique as jest.Mock).mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, status: 'COMPLETED' }),
    );

    const queue = makeScanQueue();
    const exec = build(prisma, makeScannerRegistry(60_000), queue, makeRedis(), 5_000);

    const step: TemplateStep = {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    };

    const promise = exec.runStep({ templateRun: makeRun(), step, stepIndex: 1 });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(promise).resolves.toBeUndefined();
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'scan',
      expect.objectContaining({ target: 'a.acme.com', input: { techDetect: true } }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'scan',
      expect.objectContaining({ target: 'b.acme.com', input: { techDetect: true } }),
    );
  });

  it('extracts only static inputs from step.inputs (context inputs are skipped in Phase 2)', async () => {
    const prisma = makePrisma();
    (prisma.scanJob.findUnique as jest.Mock).mockResolvedValue({
      id: 'scanjob_1',
      status: 'COMPLETED',
    });

    const queue = makeScanQueue();
    const exec = build(prisma, makeScannerRegistry(60_000), queue, makeRedis(), 5_000);

    const step: TemplateStep = {
      scannerName: 'subfinder',
      inputs: {
        sources: { kind: 'static', value: [] },
        recursive: { kind: 'static', value: false },
        // a context input — must be skipped (Phase 2 out-of-scope)
        seedFrom: { kind: 'context', path: 'subdomains' },
      },
      target: { kind: 'context', path: 'target' },
    };

    const promise = exec.runStep({ templateRun: makeRun(), step, stepIndex: 0 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5_000);
    await promise;

    const call = queue.add.mock.calls[0];
    expect(call[1].input).toEqual({ sources: [], recursive: false });
    expect((call[1].input as Record<string, unknown>).seedFrom).toBeUndefined();
  });
});

// helper local to this file: clones a prisma mock returned by makePrisma so
// we can install additional mock impls without affecting earlier specs.
function makePrisma_(p: jest.Mocked<PrismaService>): jest.Mocked<PrismaService> {
  return p;
}
