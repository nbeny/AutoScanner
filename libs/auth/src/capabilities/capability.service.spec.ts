import { CapabilityService } from './capability.service';
import { ACTIVE_RECON_HOST_NET, ACTIVE_MAIL_PROBE, ALL_CAPABILITIES } from './capability.constants';

type PrismaStub = {
  userCapability: {
    findUnique: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
};

function makePrisma(): PrismaStub {
  return {
    userCapability: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('CapabilityService', () => {
  it('has() returns false when no row exists', async () => {
    const prisma = makePrisma();
    prisma.userCapability.findUnique.mockResolvedValue(null);
    const svc = new CapabilityService(prisma as never);
    await expect(svc.has('u1', ACTIVE_RECON_HOST_NET)).resolves.toBe(false);
  });

  it('has() returns true when row exists', async () => {
    const prisma = makePrisma();
    prisma.userCapability.findUnique.mockResolvedValue({ id: 'c1' });
    const svc = new CapabilityService(prisma as never);
    await expect(svc.has('u1', ACTIVE_RECON_HOST_NET)).resolves.toBe(true);
  });

  it('grant() inserts row and emits audit log line', async () => {
    const prisma = makePrisma();
    prisma.userCapability.create.mockResolvedValue({ id: 'c1' });
    const svc = new CapabilityService(prisma as never);
    const spy = jest.spyOn(svc['logger'], 'log');
    await svc.grant('admin1', 'u1', ACTIVE_RECON_HOST_NET);
    expect(prisma.userCapability.create).toHaveBeenCalledWith({
      data: { userId: 'u1', key: ACTIVE_RECON_HOST_NET, grantedBy: 'admin1' },
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(`grant key=${ACTIVE_RECON_HOST_NET} userId=u1 by=admin1`),
    );
  });

  it('revoke() deletes row and emits audit log line', async () => {
    const prisma = makePrisma();
    prisma.userCapability.delete.mockResolvedValue({ id: 'c1' });
    const svc = new CapabilityService(prisma as never);
    const spy = jest.spyOn(svc['logger'], 'log');
    await svc.revoke('admin1', 'u1', ACTIVE_RECON_HOST_NET);
    expect(prisma.userCapability.delete).toHaveBeenCalledWith({
      where: { userId_key: { userId: 'u1', key: ACTIVE_RECON_HOST_NET } },
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(`revoke key=${ACTIVE_RECON_HOST_NET} userId=u1 by=admin1`),
    );
  });
});

describe('Phase 14B capability constants', () => {
  it('exposes ACTIVE_MAIL_PROBE = "active-mail-probe"', () => {
    expect(ACTIVE_MAIL_PROBE).toBe('active-mail-probe');
  });

  it('includes ACTIVE_MAIL_PROBE in ALL_CAPABILITIES', () => {
    expect(ALL_CAPABILITIES).toContain(ACTIVE_MAIL_PROBE);
    expect(ALL_CAPABILITIES).toContain(ACTIVE_RECON_HOST_NET);
  });
});
