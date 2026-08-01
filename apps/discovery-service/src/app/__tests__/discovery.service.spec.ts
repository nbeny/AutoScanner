import { DiscoveryService } from '../discovery.service';

function makePrisma() {
  return {
    domain: { upsert: jest.fn().mockResolvedValue({ id: 'dom_1' }) },
    subdomain: { upsert: jest.fn().mockResolvedValue({ id: 'sub_1' }) },
    ipAddress: { upsert: jest.fn().mockResolvedValue({ id: 'ip_1' }) },
  };
}

describe('DiscoveryService.getOrCreateEntity', () => {
  it('upserts a Domain keyed by engagement + canonical value', async () => {
    const prisma = makePrisma();
    const svc = new DiscoveryService(prisma as never);
    const res = await svc.getOrCreateEntity({
      engagementId: 'eng_1',
      kind: 'DOMAIN',
      value: 'Example.com',
      canonicalValue: 'example.com',
    });
    expect(res).toEqual({ id: 'dom_1', kind: 'DOMAIN' });
    expect(prisma.domain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          engagementId_canonicalValue: { engagementId: 'eng_1', canonicalValue: 'example.com' },
        },
      }),
    );
  });

  it('routes IP_ADDRESS to ipAddress.upsert', async () => {
    const prisma = makePrisma();
    const svc = new DiscoveryService(prisma as never);
    const res = await svc.getOrCreateEntity({
      engagementId: 'eng_1',
      kind: 'IP_ADDRESS',
      value: '127.0.0.1',
      canonicalValue: '127.0.0.1',
    });
    expect(res.id).toBe('ip_1');
    expect(prisma.ipAddress.upsert).toHaveBeenCalled();
  });
});
