import { ChainDecider } from '../chain-decider';
import { ChainRegistry, WebFullChain } from '@autoscanner/chains';
import type { WorldState, ResolvableEntities } from '@autoscanner/chain-engine';

const registry = new ChainRegistry();
registry.register(WebFullChain);

const world: WorldState = {
  target: 'example.com',
  openPorts: [{ port: 443, protocol: 'tcp' }],
  services: [{ port: 443, name: 'https' }],
  technologies: [{ name: 'WordPress' }],
  urls: ['https://example.com/'],
  endpoints: ['https://example.com/'],
  findings: [],
  scannersRun: [],
};
const entities: ResolvableEntities = {
  subdomains: [{ canonicalValue: 'www.example.com', httpStatus: 200 }],
  ipAddresses: [],
  urls: [{ canonicalUrl: 'https://example.com/', statusCode: 200 }],
  endpoints: [],
  emails: [],
};

function makeDeps(executedStepIds: string[]) {
  const prisma = {
    aiRun: { findUnique: jest.fn().mockResolvedValue({ chainName: 'web-full' }) },
    aiRunNode: {
      findMany: jest.fn().mockResolvedValue(executedStepIds.map((stepId) => ({ stepId }))),
    },
    aiDecision: { findMany: jest.fn().mockResolvedValue([]) },
    ipAddress: { count: jest.fn().mockResolvedValue(0) },
    technology: { findMany: jest.fn().mockResolvedValue([]) },
    endpoint: { count: jest.fn().mockResolvedValue(0) },
    finding: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;
  const worldState = { build: jest.fn().mockResolvedValue(world) } as never;
  const loader = { load: jest.fn().mockResolvedValue(entities) } as never;
  return { prisma, worldState, loader };
}

describe('ChainDecider', () => {
  it('emits a run action for the first step with static inputs', async () => {
    const { prisma, worldState, loader } = makeDeps([]);
    const decider = new ChainDecider(prisma, registry, worldState, loader);
    const outcome = await decider.decide({
      aiRunId: 'r1',
      engagementId: 'e1',
      host: 'example.com',
      chainName: 'web-full',
      budgetRemaining: { scans: 100, depth: 8 },
    });
    expect(outcome.done).toBe(false);
    expect(outcome.actions).toHaveLength(1);
    const a = outcome.actions[0];
    expect(a.kind).toBe('run');
    expect(a.scannerName).toBe('httpx');
    expect(a.stepId).toBe('httpx');
    if (a.kind === 'run') expect(a.inputs).toEqual({ techDetect: true });
  });

  it('emits a skip action when a gate fails', async () => {
    const noHttp: WorldState = { ...world, openPorts: [], services: [], urls: [] };
    const { prisma, worldState, loader } = makeDeps(['httpx']);
    (worldState as { build: jest.Mock }).build.mockResolvedValue(noHttp);
    const decider = new ChainDecider(prisma, registry, worldState, loader);
    const outcome = await decider.decide({
      aiRunId: 'r1',
      engagementId: 'e1',
      host: 'example.com',
      chainName: 'web-full',
      budgetRemaining: { scans: 100, depth: 8 },
    });
    const a = outcome.actions[0];
    expect(a.kind).toBe('skip');
    expect(a.stepId).toBe('webanalyze');
    if (a.kind === 'skip') expect(a.skipReason).toMatch(/gate/i);
  });

  it('returns done when all steps executed', async () => {
    const { prisma, worldState, loader } = makeDeps([
      'httpx',
      'webanalyze',
      'gobuster',
      'nuclei',
      'wpscan',
    ]);
    const decider = new ChainDecider(prisma, registry, worldState, loader);
    const outcome = await decider.decide({
      aiRunId: 'r1',
      engagementId: 'e1',
      host: 'example.com',
      chainName: 'web-full',
      budgetRemaining: { scans: 100, depth: 8 },
    });
    expect(outcome.done).toBe(true);
    expect(outcome.actions).toHaveLength(0);
  });
});
