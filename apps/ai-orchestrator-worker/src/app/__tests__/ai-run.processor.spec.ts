import type { Job } from 'bullmq';

import { ClaudeResponse } from '@autoscanner/claude-agent';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import type { AiRunPayload } from '@autoscanner/queues';

import { AiRunProcessor } from '../ai-run.processor';
import type { WorldState } from '../world-state.service';

/** A minimal registry stub that recognises `nmap` (and only nmap). */
function makeRegistry(): ScannerRegistry {
  return {
    has: (n: string) => n === 'nmap',
    get: (n: string) => {
      if (n !== 'nmap') throw new Error(`unknown scanner ${n}`);
      return { name: 'nmap', inputSchema: { safeParse: () => ({ success: true }) } };
    },
    list: () => [
      {
        name: 'nmap',
        displayName: 'Nmap',
        category: ['port-scan'],
        produces: ['Asset', 'Port'],
        inputSchema: { shape: {} },
      },
    ],
  } as unknown as ScannerRegistry;
}

const emptyWorldState = (target: string, scannersRun: string[] = []): WorldState => ({
  target,
  openPorts: [],
  services: [],
  technologies: [],
  urls: [],
  endpoints: [],
  findings: [],
  scannersRun,
});

function makePrisma() {
  const run = {
    id: 'r1',
    engagementId: 'e1',
    createdById: 'u1',
    target: '1.2.3.4',
    strategy: 'SINGLE_HOST',
    status: 'PENDING',
    guardrails: { maxScans: 200, maxDepth: 8, timeBudgetMs: 1e9, hostCap: 16 },
    scanCount: 0,
    currentDepth: 0,
  };

  // findUnique: first call = full run; subsequent (scanCount refresh) 0 then 1.
  const scanCountSeq = [{ scanCount: 0 }, { scanCount: 1 }];
  const findUnique = jest.fn().mockImplementation(({ select }: { select?: unknown }) => {
    if (select) {
      return Promise.resolve(scanCountSeq.shift() ?? { scanCount: 1 });
    }
    return Promise.resolve(run);
  });

  return {
    aiRun: {
      findUnique,
      update: jest.fn().mockResolvedValue({}),
    },
    aiRunNode: {
      create: jest.fn().mockResolvedValue({ id: 'n1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    aiDecision: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([{ round: 0 }]),
    },
    finding: {
      findMany: jest.fn().mockResolvedValue([{ title: 'Open SSH', severity: 'LOW' }]),
    },
    ipAddress: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
}

const job = { data: { aiRunId: 'r1', engagementId: 'e1' } as AiRunPayload } as Job<AiRunPayload>;

describe('AiRunProcessor', () => {
  it('runs the decide->dispatch->audit loop and completes', async () => {
    const prisma = makePrisma();
    const registry = makeRegistry();

    const responses = [
      new ClaudeResponse(
        '{"done":false,"rationale":"recon","next":[{"scannerName":"nmap","target":"1.2.3.4","inputs":{},"why":"ports"}]}',
      ),
      new ClaudeResponse('{"done":true,"rationale":"done","next":[]}'),
      new ClaudeResponse('# Audit\nAll clear.'),
    ];
    const claude = {
      complete: jest.fn().mockImplementation(() => Promise.resolve(responses.shift())),
    } as any;

    const dispatcher = {
      dispatchMany: jest
        .fn()
        .mockResolvedValue([{ scanId: 's1', scanJobId: 'j1', status: 'COMPLETED' }]),
    } as any;

    const worldState = {
      build: jest
        .fn()
        .mockImplementation((_id, _eng, target) => Promise.resolve(emptyWorldState(target))),
    } as any;

    const events = { publish: jest.fn().mockResolvedValue(undefined) } as any;

    const processor = new AiRunProcessor(prisma, registry, claude, dispatcher, worldState, events);

    await processor.process(job);

    expect(dispatcher.dispatchMany).toHaveBeenCalledTimes(1);
    expect(prisma.aiRunNode.create).toHaveBeenCalledTimes(1);
    expect(prisma.aiRunNode.create.mock.calls[0][0].data.scannerName).toBe('nmap');

    const updates = prisma.aiRun.update.mock.calls.map((c: any) => c[0].data);
    const finalUpdate = updates.find((d: any) => d.status === 'COMPLETED');
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate.auditText).toBeTruthy();
  });

  it('falls back deterministically on empty model output and still audits', async () => {
    const prisma = makePrisma();
    const registry = makeRegistry();

    // Always empty -> forces the degraded fallback path.
    const claude = {
      complete: jest.fn().mockResolvedValue(new ClaudeResponse('')),
    } as any;

    const dispatcher = {
      dispatchMany: jest
        .fn()
        .mockResolvedValue([{ scanId: 's1', scanJobId: 'j1', status: 'COMPLETED' }]),
    } as any;

    // 1st build: no scanners run -> fallback dispatches nmap.
    // 2nd+ build: nmap already run -> fallback returns done -> loop ends.
    let builds = 0;
    const worldState = {
      build: jest.fn().mockImplementation((_id, _eng, target) => {
        builds++;
        return Promise.resolve(emptyWorldState(target, builds > 1 ? ['nmap'] : []));
      }),
    } as any;

    const events = { publish: jest.fn().mockResolvedValue(undefined) } as any;

    const processor = new AiRunProcessor(prisma, registry, claude, dispatcher, worldState, events);

    await processor.process(job);

    // Fallback dispatched nmap exactly once.
    expect(dispatcher.dispatchMany).toHaveBeenCalledTimes(1);
    expect(prisma.aiRunNode.create.mock.calls[0][0].data.scannerName).toBe('nmap');

    // Run flagged degraded.
    const degradedUpdate = prisma.aiRun.update.mock.calls
      .map((c: any) => c[0].data)
      .find((d: any) => d.degraded === true);
    expect(degradedUpdate).toBeDefined();

    // Completed with a (fallback) audit.
    const finalUpdate = prisma.aiRun.update.mock.calls
      .map((c: any) => c[0].data)
      .find((d: any) => d.status === 'COMPLETED');
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate.auditText).toContain('AutoHunt Audit');
  });
});
