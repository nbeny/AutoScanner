import { ResolvableEntitiesLoader } from '../entities-loader.service';

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    subdomain: {
      findMany: jest.fn().mockResolvedValue([{ canonicalValue: 'www.x.com', httpStatus: 200 }]),
    },
    ipAddress: {
      findMany: jest.fn().mockResolvedValue([
        { value: '1.1.1.1', canonicalValue: '1.1.1.1' },
        { value: '2.2.2.2', canonicalValue: '2.2.2.2' },
      ]),
    },
    endpoint: {
      findMany: jest.fn().mockResolvedValue([{ canonicalUrl: 'https://x.com/a', statusCode: 200 }]),
    },
    email: { findMany: jest.fn().mockResolvedValue([{ address: 'a@x.com' }]) },
    asset: {
      findMany: jest.fn().mockResolvedValue([
        {
          value: '1.1.1.1',
          canonicalValue: '1.1.1.1',
          technologies: [{ name: 'CDN: cloudflare', categories: ['cdn'] }],
        },
        {
          value: '2.2.2.2',
          canonicalValue: '2.2.2.2',
          technologies: [{ name: 'nginx', categories: [] }],
        },
      ]),
    },
    ...over,
  } as never;
}

describe('ResolvableEntitiesLoader', () => {
  it('maps DB rows into ResolvableEntities', async () => {
    const loader = new ResolvableEntitiesLoader(makePrisma());
    const e = await loader.load('eng1');
    expect(e.subdomains).toEqual([{ canonicalValue: 'www.x.com', httpStatus: 200 }]);
    expect(e.urls).toEqual([{ canonicalUrl: 'https://x.com/a', statusCode: 200 }]);
    expect(e.emails).toEqual([{ address: 'a@x.com' }]);
  });

  it('derives cdn.behind from a "CDN:" technology on the ip asset', async () => {
    const loader = new ResolvableEntitiesLoader(makePrisma());
    const e = await loader.load('eng1');
    const byIp = Object.fromEntries(e.ipAddresses.map((i) => [i.value, i.cdn]));
    expect(byIp['1.1.1.1']).toEqual({ behind: true });
    expect(byIp['2.2.2.2']).toEqual({ behind: false });
  });

  it('leaves cdn undefined for an ip with no asset (fail-open at predicate level)', async () => {
    const prisma = makePrisma({ asset: { findMany: jest.fn().mockResolvedValue([]) } });
    const loader = new ResolvableEntitiesLoader(prisma);
    const e = await loader.load('eng1');
    expect(e.ipAddresses.every((i) => i.cdn === undefined)).toBe(true);
  });
});
