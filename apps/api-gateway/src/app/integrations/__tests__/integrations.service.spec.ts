import { IntegrationsService } from '../integrations.service';

function harness() {
  const prisma = {
    integrationCredential: {
      upsert: jest.fn().mockResolvedValue({ id: 'cred1' }),
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id: 'cred1', configEncrypted: Buffer.from('x') }),
    },
  };
  const secretBox = {
    seal: jest.fn(() => Buffer.from('sealed')),
    open: jest.fn(() => JSON.stringify({ repo: 'o/r', token: 't' })),
  };
  const svc = new IntegrationsService(prisma as never, secretBox as never);
  return { svc, prisma, secretBox };
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
