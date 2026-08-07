import { KaliRunsService } from '../kali-runs.service';

function svc(over: { known?: boolean; scopeRules?: any[] } = {}) {
  const prisma = {
    engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'e1' }) },
    scopeRule: { findMany: jest.fn().mockResolvedValue(over.scopeRules ?? []) },
    kaliToolRun: {
      create: jest
        .fn()
        .mockResolvedValue({
          id: 'r1',
          engagementId: 'e1',
          binary: 'nmap',
          argsJson: [],
          status: 'PENDING',
        }),
    },
  };
  const kali = {
    findByBinary: jest.fn().mockReturnValue(over.known === false ? null : { binary: 'nmap' }),
  };
  const bus = { publish: jest.fn().mockResolvedValue(undefined) };
  return { s: new KaliRunsService(prisma as any, kali as any, bus as any), prisma, kali, bus };
}

describe('KaliRunsService.runKaliTool', () => {
  it('rejects an unknown binary', async () => {
    const { s } = svc({ known: false });
    await expect(
      s.runKaliTool('u1', { engagementId: 'e1', binary: 'evil', args: [] }),
    ).rejects.toThrow(/unknown|allow/i);
  });

  it('rejects an out-of-scope target arg', async () => {
    const { s } = svc({
      scopeRules: [{ ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'in.example.com' }],
    });
    await expect(
      s.runKaliTool('u1', { engagementId: 'e1', binary: 'nmap', args: ['-sV', 'evil.other.com'] }),
    ).rejects.toThrow(/scope/i);
  });

  it('creates the run and publishes requested', async () => {
    const { s, bus, prisma } = svc({
      scopeRules: [{ ruleType: 'INCLUDE', targetType: 'WILDCARD_DOMAIN', value: 'example.com' }],
    });
    const run = await s.runKaliTool('u1', {
      engagementId: 'e1',
      binary: 'nmap',
      args: ['-sV', 'scanme.example.com'],
    });
    expect(prisma.kaliToolRun.create).toHaveBeenCalled();
    expect(bus.publish).toHaveBeenCalledWith('security.kalitool.requested', 'r1', { runId: 'r1' });
    expect(run.id).toBe('r1');
  });
});
