import { KaliRunsService } from '../kali-runs.service';

function svc(over: { known?: boolean; scopeRules?: any[]; engagementFound?: boolean } = {}) {
  const prisma = {
    engagement: {
      findFirst: jest.fn().mockResolvedValue(over.engagementFound === false ? null : { id: 'e1' }),
    },
    scopeRule: { findMany: jest.fn().mockResolvedValue(over.scopeRules ?? []) },
    kaliToolRun: {
      create: jest.fn().mockResolvedValue({
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

  it('rejects when the engagement is not owned by the caller (or is soft-deleted)', async () => {
    const { s } = svc({ engagementFound: false });
    await expect(
      s.runKaliTool('u1', { engagementId: 'e1', binary: 'nmap', args: [] }),
    ).rejects.toThrow(/not found/i);
  });

  it('allows an in-scope IP target (IP rule)', async () => {
    const { s, bus } = svc({
      scopeRules: [{ ruleType: 'INCLUDE', targetType: 'IP', value: '10.0.0.5' }],
    });
    await s.runKaliTool('u1', { engagementId: 'e1', binary: 'nmap', args: ['-sV', '10.0.0.5'] });
    expect(bus.publish).toHaveBeenCalled();
  });

  it('allows an in-scope IP target inside a CIDR rule', async () => {
    const { s, bus } = svc({
      scopeRules: [{ ruleType: 'INCLUDE', targetType: 'CIDR', value: '10.0.0.0/24' }],
    });
    await s.runKaliTool('u1', { engagementId: 'e1', binary: 'nmap', args: ['-sV', '10.0.0.42'] });
    expect(bus.publish).toHaveBeenCalled();
  });

  it('rejects an IP outside every CIDR/IP rule', async () => {
    const { s } = svc({
      scopeRules: [{ ruleType: 'INCLUDE', targetType: 'CIDR', value: '10.0.0.0/24' }],
    });
    await expect(
      s.runKaliTool('u1', { engagementId: 'e1', binary: 'nmap', args: ['10.0.1.42'] }),
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
