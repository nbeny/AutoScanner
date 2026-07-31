import { ChainLauncher } from '../chains.service';
import { ChainRegistry, WebFullChain } from '@autoscanner/chains';

const registry = new ChainRegistry();
registry.register(WebFullChain);

function deps() {
  const prisma = {
    aiRun: { create: jest.fn().mockResolvedValue({ id: 'r1' }), update: jest.fn() },
  } as never;
  const bus = { publish: jest.fn().mockResolvedValue(undefined) } as never;
  const provisioner = {
    ensureEngagement: jest.fn().mockResolvedValue({ id: 'e1' }),
    grantAllCapabilities: jest.fn().mockResolvedValue(undefined),
    addTargetToScope: jest.fn().mockResolvedValue(undefined),
  } as never;
  return { prisma, bus, provisioner };
}

describe('ChainLauncher', () => {
  it('rejects an unknown chain', async () => {
    const { prisma, bus, provisioner } = deps();
    const svc = new ChainLauncher(prisma, bus, provisioner, registry);
    await expect(svc.launch('u1', { chainName: 'nope', target: 'example.com' })).rejects.toThrow(
      /unknown chain/i,
    );
  });

  it('rejects an empty target', async () => {
    const { prisma, bus, provisioner } = deps();
    const svc = new ChainLauncher(prisma, bus, provisioner, registry);
    await expect(svc.launch('u1', { chainName: 'web-full', target: '  ' })).rejects.toThrow(
      /target/i,
    );
  });

  it('creates a CHAIN AiRun and enqueues it', async () => {
    const { prisma, bus, provisioner } = deps();
    const svc = new ChainLauncher(prisma, bus, provisioner, registry);
    const run = await svc.launch('u1', { chainName: 'web-full', target: 'example.com' });
    expect(run.id).toBe('r1');
    const createArg = (prisma as { aiRun: { create: jest.Mock } }).aiRun.create.mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      chainName: 'web-full',
      strategy: 'SINGLE_HOST',
      target: 'example.com',
    });
    expect((bus as unknown as { publish: jest.Mock }).publish).toHaveBeenCalledWith(
      'security.ai.run.requested',
      expect.any(String),
      {
        aiRunId: 'r1',
        engagementId: 'e1',
      },
    );
  });

  it('lists chain capabilities from the registry', () => {
    const { prisma, bus, provisioner } = deps();
    const svc = new ChainLauncher(prisma, bus, provisioner, registry);
    const caps = svc.listCapabilities();
    expect(caps.find((c) => c.name === 'web-full')?.whenToUse).toMatch(/HTTP/i);
  });
});
