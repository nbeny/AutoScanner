import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { ValidationError } from '@autoscanner/common';
import { CapabilityService, ACTIVE_RECON_HOST_NET } from '@autoscanner/auth';
import { ScansService } from '../scans.service';
import { IkeScanScanner } from '@autoscanner/scanners-ike-scan';

describe('ike-scan capability gate (negative)', () => {
  let registry: ScannerRegistry;
  let capabilities: jest.Mocked<CapabilityService>;
  let prisma: { engagement: { findFirst: jest.Mock }; $transaction: jest.Mock };
  let bus: { publish: jest.Mock };
  let storage: unknown;
  let scanControl: unknown;
  let events: unknown;
  let svc: ScansService;

  beforeEach(() => {
    registry = new ScannerRegistry();
    registry.register(IkeScanScanner);
    capabilities = { has: jest.fn() } as unknown as jest.Mocked<CapabilityService>;
    prisma = {
      engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'eng1' }) },
      $transaction: jest.fn(),
    };
    bus = { publish: jest.fn().mockResolvedValue(undefined) };
    storage = {};
    scanControl = { publishCancel: jest.fn() };
    events = { publish: jest.fn() };
    svc = new ScansService(
      prisma as never,
      registry,
      bus as never,
      storage as never,
      scanControl as never,
      events as never,
      capabilities,
    );
  });

  it('rejects ike-scan with ValidationError when capability is absent', async () => {
    capabilities.has.mockResolvedValue(false);
    await expect(
      svc.runScan('user1', {
        engagementId: 'eng1',
        scannerName: 'ike-scan',
        target: '1.1.1.1',
        optionsJson: '{}',
        agentId: null,
        name: null,
      } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(capabilities.has).toHaveBeenCalledWith('user1', ACTIVE_RECON_HOST_NET);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('proceeds when capability is present', async () => {
    capabilities.has.mockResolvedValue(true);
    prisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        scan: {
          create: jest.fn().mockResolvedValue({ id: 's1', engagementId: 'eng1' }),
        },
        scanJob: {
          create: jest.fn().mockResolvedValue({ id: 'sj1' }),
        },
      }),
    );
    bus.publish.mockResolvedValue(undefined);
    await svc.runScan('user1', {
      engagementId: 'eng1',
      scannerName: 'ike-scan',
      target: '1.1.1.1',
      optionsJson: '{}',
      agentId: null,
      name: null,
    } as never);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
