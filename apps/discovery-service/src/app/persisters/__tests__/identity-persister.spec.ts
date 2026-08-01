import { IdentityPersister } from '../identity-persister';
import type { NormalizedIdentity, ParserContext } from '@autoscanner/parsers';

const ctx: ParserContext = {
  scanJobId: 'j',
  scannerName: 'maigret',
  target: 'jdoe',
  engagementId: 'eng-1',
};

function makePrisma() {
  const upsert = jest.fn().mockResolvedValue({});
  return { upsert, prisma: { identity: { upsert } } };
}

describe('IdentityPersister', () => {
  it('upserts one row per identity keyed by (engagement, kind, seed, service)', async () => {
    const { upsert, prisma } = makePrisma();
    const persister = new IdentityPersister(prisma as never);
    const items: NormalizedIdentity[] = [
      {
        kind: 'USERNAME',
        seed: 'jdoe',
        service: 'GitHub',
        url: 'https://github.com/jdoe',
        source: 'maigret',
      },
      { kind: 'EMAIL_ACCOUNT', seed: 'a@b.com', service: 'twitter.com', source: 'holehe' },
    ];

    const count = await persister.upsert(items, ctx);

    expect(count).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: {
        engagementId_kind_seed_service: {
          engagementId: 'eng-1',
          kind: 'USERNAME',
          seed: 'jdoe',
          service: 'GitHub',
        },
      },
      create: expect.objectContaining({ url: 'https://github.com/jdoe', source: 'maigret' }),
    });
  });

  it('skips identities with empty seed or service', async () => {
    const { upsert, prisma } = makePrisma();
    const persister = new IdentityPersister(prisma as never);
    const count = await persister.upsert(
      [{ kind: 'USERNAME', seed: '  ', service: 'GitHub', source: 'maigret' }],
      ctx,
    );
    expect(count).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
