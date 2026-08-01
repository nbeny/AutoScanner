import { IntegrationsService } from '../integrations.service';

function harness() {
  const prisma = {
    integrationCredential: {
      upsert: jest.fn().mockResolvedValue({ id: 'cred1' }),
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id: 'cred1', configEncrypted: Buffer.from('x') }),
    },
    correlatedFinding: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'cf1',
        engagementId: 'e1',
        title: 'SQLi',
        severity: 'CRITICAL',
        cveId: null,
        engagement: { ownerId: 'u1' },
        asset: { canonicalValue: 'api.x.com' },
      }),
    },
    ticket: {
      create: jest.fn().mockResolvedValue({ id: 't1' }),
      update: jest.fn(async ({ data }: { data: unknown }) => ({ id: 't1', ...(data as object) })),
    },
  };
  const secretBox = {
    seal: jest.fn(() => Buffer.from('sealed')),
    open: jest.fn(() => JSON.stringify({ repo: 'o/r', token: 't' })),
  };
  const github = {
    createIssue: jest.fn().mockResolvedValue({ externalId: '5', externalUrl: 'u' }),
  };
  const jira = { createIssue: jest.fn() };
  const svc = new IntegrationsService(
    prisma as never,
    secretBox as never,
    github as never,
    jira as never,
  );
  return { svc, prisma, secretBox, github, jira };
}

describe('IntegrationsService.createCredential', () => {
  it('seals the config JSON and upserts per (user, provider)', async () => {
    const { svc, prisma, secretBox } = harness();
    await svc.createCredential('u1', {
      provider: 'GITHUB' as never,
      name: 'gh',
      config: '{"repo":"o/r","token":"t"}',
    });
    expect(secretBox.seal).toHaveBeenCalled();
    expect(prisma.integrationCredential.upsert).toHaveBeenCalled();
  });

  it('rejects non-JSON config', async () => {
    const { svc } = harness();
    await expect(
      svc.createCredential('u1', { provider: 'GITHUB' as never, name: 'x', config: 'not json' }),
    ).rejects.toThrow(/valid JSON/);
  });
});

describe('IntegrationsService.createTicket', () => {
  it('creates a GitHub issue and marks the ticket CREATED', async () => {
    const { svc, github, prisma } = harness();

    const res = await svc.createTicket('u1', {
      correlatedFindingId: 'cf1',
      provider: 'GITHUB' as never,
    });

    expect(github.createIssue).toHaveBeenCalledWith(
      { repo: 'o/r', token: 't' },
      expect.objectContaining({ title: '[CRITICAL] SQLi' }),
    );
    expect(prisma.ticket.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CREATED', externalId: '5' }),
      }),
    );
    expect(res).toMatchObject({ status: 'CREATED' });
  });

  it('marks the ticket FAILED when the adapter throws', async () => {
    const { svc, github } = harness();
    github.createIssue.mockRejectedValue(new Error('GitHub 401'));

    const res = await svc.createTicket('u1', {
      correlatedFindingId: 'cf1',
      provider: 'GITHUB' as never,
    });

    expect(res).toMatchObject({ status: 'FAILED', errorMessage: 'GitHub 401' });
  });

  it('rejects a finding owned by another user', async () => {
    const { svc, prisma } = harness();
    (prisma.correlatedFinding.findUnique as jest.Mock).mockResolvedValue({
      id: 'cf1',
      engagementId: 'e1',
      title: 'x',
      severity: 'HIGH',
      cveId: null,
      engagement: { ownerId: 'someone-else' },
      asset: { canonicalValue: 'x' },
    });

    await expect(
      svc.createTicket('u1', { correlatedFindingId: 'cf1', provider: 'GITHUB' as never }),
    ).rejects.toThrow();
  });

  it('rejects when no credential is configured', async () => {
    const { svc, prisma } = harness();
    (prisma.integrationCredential.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      svc.createTicket('u1', { correlatedFindingId: 'cf1', provider: 'JIRA' as never }),
    ).rejects.toThrow(/no enabled/);
  });
});
