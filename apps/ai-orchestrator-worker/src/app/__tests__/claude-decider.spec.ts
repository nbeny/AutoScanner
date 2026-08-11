import { ClaudeDecider } from '../claude-decider';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';

const world = {
  target: 'example.com',
  scannersRun: [],
  recentOutputs: [],
};

function makeRegistry(): ScannerRegistry {
  const r = {
    has: jest.fn().mockReturnValue(true),
    get: jest.fn(),
    list: jest.fn().mockReturnValue([]),
  } as unknown as ScannerRegistry;
  return r;
}

function makePrisma() {
  return {
    finding: { findMany: jest.fn().mockResolvedValue([]) },
    aiDecision: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;
}

describe('ClaudeDecider', () => {
  it('maps a validated Claude decision into run actions', async () => {
    const prisma = makePrisma();
    const registry = makeRegistry();
    (registry.get as jest.Mock).mockReturnValue({
      inputSchema: { safeParse: () => ({ success: true }) },
    });
    const claude = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          done: false,
          rationale: 'go',
          next: [{ scannerName: 'nmap', target: 'example.com', args: '-sV', why: 'recon' }],
        }),
        safeJson: (_fallback: unknown) => ({
          done: false,
          rationale: 'go',
          next: [{ scannerName: 'nmap', target: 'example.com', args: '-sV', why: 'recon' }],
        }),
      }),
    } as never;
    const worldState = { build: jest.fn().mockResolvedValue(world) } as never;
    const decider = new ClaudeDecider(prisma, registry, claude, worldState);
    const outcome = await decider.decide({
      aiRunId: 'r1',
      engagementId: 'e1',
      host: 'example.com',
      budgetRemaining: { scans: 100, depth: 8 },
    });
    expect(outcome.actions[0]).toMatchObject({
      kind: 'run',
      scannerName: 'nmap',
      rationale: 'recon',
    });
    expect(outcome.actions[0].stepId).toBeUndefined();
  });

  it('flags degraded when Claude returns empty', async () => {
    const prisma = makePrisma();
    const registry = makeRegistry();
    (registry.has as jest.Mock).mockImplementation((n: string) => n === 'nmap');
    const claude = {
      complete: jest.fn().mockResolvedValue({ text: '', safeJson: (f: unknown) => f }),
    } as never;
    const worldState = { build: jest.fn().mockResolvedValue(world) } as never;
    const decider = new ClaudeDecider(prisma, registry, claude, worldState);
    const outcome = await decider.decide({
      aiRunId: 'r1',
      engagementId: 'e1',
      host: 'example.com',
      budgetRemaining: { scans: 100, depth: 8 },
    });
    expect(outcome.degraded).toBe(true);
  });
});
