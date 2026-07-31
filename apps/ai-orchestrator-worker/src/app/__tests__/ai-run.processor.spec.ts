import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import type { AiRunPayload } from '@autoscanner/queues';
import type { ConsumerRegistrar, MessageContext } from '@autoscanner/messaging';

import { AiRunProcessor } from '../ai-run.processor';
import type { DecisionOutcome } from '../next-step-decider';

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

function makePrisma() {
  const run = {
    id: 'r1',
    engagementId: 'e1',
    createdById: 'u1',
    target: '1.2.3.4',
    strategy: 'SINGLE_HOST',
    status: 'PENDING',
    chainName: null,
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

const job = {
  id: 'msg_1',
  type: 'security.ai.run.requested',
  key: 'r1',
  attempt: 1,
  payload: { aiRunId: 'r1', engagementId: 'e1' } as AiRunPayload,
} as MessageContext<AiRunPayload>;

/** A no-op ChainDecider — an AI run (chainName null) never touches it. */
const noopChainDecider = { decide: jest.fn(), audit: jest.fn() } as any;

describe('AiRunProcessor (AI run — ClaudeDecider path)', () => {
  it('runs the decide->dispatch->audit loop and completes', async () => {
    const prisma = makePrisma();
    const registry = makeRegistry();

    // ClaudeDecider drives the loop: propose nmap, then done.
    const outcomes: DecisionOutcome[] = [
      {
        done: false,
        actions: [
          { kind: 'run', scannerName: 'nmap', target: '1.2.3.4', inputs: {}, rationale: 'ports' },
        ],
        snapshot: { target: '1.2.3.4' },
      },
      { done: true, actions: [], snapshot: { target: '1.2.3.4' } },
    ];
    const claudeDecider = {
      decide: jest.fn().mockImplementation(() => Promise.resolve(outcomes.shift())),
      audit: jest.fn().mockResolvedValue('# Audit\nAll clear.'),
    } as any;

    const dispatcher = {
      dispatchMany: jest
        .fn()
        .mockResolvedValue([{ scanId: 's1', scanJobId: 'j1', status: 'COMPLETED' }]),
    } as any;

    const events = { publish: jest.fn().mockResolvedValue(undefined) } as any;

    const processor = new AiRunProcessor(
      prisma,
      registry,
      dispatcher,
      events,
      claudeDecider,
      noopChainDecider,
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );

    await processor.process(job);

    // Chain decider is never consulted for an AI run.
    expect(noopChainDecider.decide).not.toHaveBeenCalled();

    expect(dispatcher.dispatchMany).toHaveBeenCalledTimes(1);
    expect(prisma.aiRunNode.create).toHaveBeenCalledTimes(1);
    expect(prisma.aiRunNode.create.mock.calls[0][0].data.scannerName).toBe('nmap');

    // Audit delegated to the decider and persisted.
    expect(claudeDecider.audit).toHaveBeenCalledWith({ aiRunId: 'r1', target: '1.2.3.4' });
    const updates = prisma.aiRun.update.mock.calls.map((c: any) => c[0].data);
    const finalUpdate = updates.find((d: any) => d.status === 'COMPLETED');
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate.auditText).toBe('# Audit\nAll clear.');
  });

  it('propagates a degraded decision and still audits/completes', async () => {
    const prisma = makePrisma();
    const registry = makeRegistry();

    // Decider flags a degraded round (its own deterministic fallback), then done.
    const outcomes: DecisionOutcome[] = [
      {
        done: false,
        degraded: true,
        actions: [
          {
            kind: 'run',
            scannerName: 'nmap',
            target: '1.2.3.4',
            inputs: {},
            rationale: 'baseline recon',
          },
        ],
        snapshot: { target: '1.2.3.4' },
      },
      { done: true, actions: [], snapshot: { target: '1.2.3.4' } },
    ];
    const claudeDecider = {
      decide: jest.fn().mockImplementation(() => Promise.resolve(outcomes.shift())),
      audit: jest.fn().mockResolvedValue('# AutoHunt Audit (degraded)\n\nTotal findings: 0'),
    } as any;

    const dispatcher = {
      dispatchMany: jest
        .fn()
        .mockResolvedValue([{ scanId: 's1', scanJobId: 'j1', status: 'COMPLETED' }]),
    } as any;

    const events = { publish: jest.fn().mockResolvedValue(undefined) } as any;

    const processor = new AiRunProcessor(
      prisma,
      registry,
      dispatcher,
      events,
      claudeDecider,
      noopChainDecider,
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );

    await processor.process(job);

    // Degraded round dispatched nmap exactly once.
    expect(dispatcher.dispatchMany).toHaveBeenCalledTimes(1);
    expect(prisma.aiRunNode.create.mock.calls[0][0].data.scannerName).toBe('nmap');

    // Run flagged degraded (propagated from the outcome).
    const degradedUpdate = prisma.aiRun.update.mock.calls
      .map((c: any) => c[0].data)
      .find((d: any) => d.degraded === true);
    expect(degradedUpdate).toBeDefined();

    // Completed with the (fallback) audit from the decider.
    const finalUpdate = prisma.aiRun.update.mock.calls
      .map((c: any) => c[0].data)
      .find((d: any) => d.status === 'COMPLETED');
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate.auditText).toContain('AutoHunt Audit');
  });
});
