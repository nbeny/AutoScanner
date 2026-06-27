import { CapabilitiesResolver } from '../capabilities.resolver';
import { CapabilityService, ACTIVE_RECON_HOST_NET } from '@autoscanner/auth';

describe('CapabilitiesResolver', () => {
  let svc: jest.Mocked<CapabilityService>;
  let resolver: CapabilitiesResolver;

  beforeEach(() => {
    svc = {
      has: jest.fn(),
      grant: jest.fn(),
      revoke: jest.fn(),
    } as unknown as jest.Mocked<CapabilityService>;
    resolver = new CapabilitiesResolver(svc);
  });

  it('grantCapability() forwards to service and returns true', async () => {
    svc.grant.mockResolvedValue(undefined);
    const ok = await resolver.grantCapability('admin1', 'u1', ACTIVE_RECON_HOST_NET);
    expect(svc.grant).toHaveBeenCalledWith('admin1', 'u1', ACTIVE_RECON_HOST_NET);
    expect(ok).toBe(true);
  });

  it('hasCapability() returns the service value', async () => {
    svc.has.mockResolvedValue(true);
    await expect(resolver.hasCapability('u1', ACTIVE_RECON_HOST_NET)).resolves.toBe(true);
  });

  it('revokeCapability() forwards to service and returns true', async () => {
    svc.revoke.mockResolvedValue(undefined);
    const ok = await resolver.revokeCapability('admin1', 'u1', ACTIVE_RECON_HOST_NET);
    expect(svc.revoke).toHaveBeenCalledWith('admin1', 'u1', ACTIVE_RECON_HOST_NET);
    expect(ok).toBe(true);
  });
});
