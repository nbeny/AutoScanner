import type { ConsumerRegistrar } from '@autoscanner/messaging';

import { AiRunProcessor } from '../ai-run.processor';
import type { DecisionOutcome } from '../next-step-decider';

function makePrisma() {
  const aiRun = {
    chainName: 'web-full',
    engagementId: 'e1',
    createdById: 'u1',
    target: 'example.com',
    status: 'PENDING',
    currentDepth: 0,
    guardrails: {},
    scanCount: 0,
    startedAt: null,
  };
  return {
    aiRun: {
      findUnique: jest.fn().mockResolvedValue({ ...aiRun, scanCount: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    aiRunNode: {
      create: jest.fn().mockResolvedValue({ id: 'n1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    aiDecision: { create: jest.fn().mockResolvedValue({}) },
    finding: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;
}

describe('AiRunProcessor chain flow', () => {
  it('creates a skip node without dispatching when action is skip', async () => {
    const prisma = makePrisma();
    const chainDecider = {
      decide: jest
        .fn<Promise<DecisionOutcome>, []>()
        .mockResolvedValueOnce({
          done: false,
          actions: [
            {
              kind: 'skip',
              scannerName: 'wpscan',
              target: 'example.com',
              stepId: 'wpscan',
              skipReason: 'gate: techPresent',
            },
          ],
        })
        .mockResolvedValueOnce({ done: true, actions: [] }),
      audit: jest.fn().mockResolvedValue('# audit'),
    } as never;
    const claudeDecider = { decide: jest.fn(), audit: jest.fn() } as never;
    const dispatcher = { dispatchMany: jest.fn().mockResolvedValue([]) } as never;
    const events = { publish: jest.fn().mockResolvedValue(undefined) } as never;
    const registry = { has: jest.fn().mockReturnValue(true) } as never;

    const proc = new AiRunProcessor(
      prisma,
      registry,
      dispatcher,
      events,
      claudeDecider,
      chainDecider,
      { enrich: jest.fn().mockResolvedValue({ findings: [] }) } as never,
      { register: jest.fn() } as unknown as ConsumerRegistrar,
    );
    await proc.process({
      id: 'msg_1',
      type: 'security.ai.run.requested',
      key: 'r1',
      attempt: 1,
      payload: { aiRunId: 'r1' },
    } as never);

    // node de skip créé avec skipReason, pas de dispatch
    const nodeCreate = (prisma as { aiRunNode: { create: jest.Mock } }).aiRunNode.create;
    expect(nodeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stepId: 'wpscan',
          skipReason: expect.stringMatching(/gate/),
        }),
      }),
    );
    expect((dispatcher as { dispatchMany: jest.Mock }).dispatchMany).not.toHaveBeenCalled();
  });
});
