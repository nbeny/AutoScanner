import { CopilotService } from '../copilot.service';

function harness(owner = 'u1') {
  const prisma = {
    engagement: {
      findFirst: jest.fn().mockResolvedValue(owner ? { id: 'e1', name: 'Acme' } : null),
    },
    correlatedFinding: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          {
            title: 'Log4Shell',
            severity: 'CRITICAL',
            cveId: 'CVE-2021-44228',
            status: 'OPEN',
            asset: { canonicalValue: 'a.x' },
          },
        ]),
    },
    asset: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ canonicalValue: 'a.x', type: 'DOMAIN', riskScore: 9 }]),
    },
  };
  const copilot = {
    run: jest
      .fn()
      .mockResolvedValue({
        output: { answer: 'Patch log4j', references: ['Log4Shell'] },
        degraded: false,
      }),
  };
  const svc = new CopilotService(prisma as never, copilot as never);
  return { svc, prisma, copilot };
}

describe('CopilotService.ask', () => {
  it('builds engagement context and returns the copilot answer', async () => {
    const { svc, copilot } = harness();

    const res = await svc.ask('u1', 'e1', 'What should I fix first?');

    expect(res).toEqual({ answer: 'Patch log4j', references: ['Log4Shell'], degraded: false });
    const ctx = copilot.run.mock.calls[0][0].context as string;
    expect(ctx).toContain('Log4Shell');
    expect(ctx).toContain('a.x');
    expect(copilot.run.mock.calls[0][0].question).toBe('What should I fix first?');
  });

  it('rejects an engagement the user does not own', async () => {
    const { svc, prisma } = harness();
    (prisma.engagement.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(svc.ask('u1', 'e1', 'q')).rejects.toThrow();
  });

  it('surfaces the degraded flag from the agent', async () => {
    const { svc, copilot } = harness();
    copilot.run.mockResolvedValue({
      output: { answer: 'unavailable', references: [] },
      degraded: true,
    });

    const res = await svc.ask('u1', 'e1', 'q');

    expect(res.degraded).toBe(true);
  });
});
