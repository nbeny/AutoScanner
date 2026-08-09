import { ScansService } from '../scans.service';
import { ScanGroup } from '../dto/scan-group.enum';

describe('ScansService.listAllForOwner — filtre group', () => {
  function makeService(scans: unknown[]) {
    const prisma = { scan: { findMany: jest.fn().mockResolvedValue(scans) } };
    const registry = { osintScannerNames: jest.fn().mockReturnValue(['shodan', 'holehe']) };
    const svc = Object.create(ScansService.prototype) as ScansService;
    (svc as unknown as { prisma: unknown }).prisma = prisma;
    (svc as unknown as { registry: unknown }).registry = registry;
    return { svc, prisma };
  }

  it('OSINT : ne garde que les jobs OSINT des scans', async () => {
    const scans = [
      {
        id: 's1',
        status: 'RUNNING',
        jobs: [
          { id: 'j1', scannerName: 'shodan' },
          { id: 'j2', scannerName: 'nmap' },
        ],
      },
    ];
    const { svc, prisma } = makeService(scans);
    const res = await svc.listAllForOwner('u1', { group: ScanGroup.OSINT });
    const where = (prisma.scan.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.jobs.some.scannerName.in).toEqual(['shodan', 'holehe']);
    expect(res[0].jobs.map((j: { id: string }) => j.id)).toEqual(['j1']);
  });

  it('RECON : exclut les jobs OSINT (notIn)', async () => {
    const scans = [
      {
        id: 's1',
        status: 'RUNNING',
        jobs: [
          { id: 'j1', scannerName: 'shodan' },
          { id: 'j2', scannerName: 'nmap' },
        ],
      },
    ];
    const { svc, prisma } = makeService(scans);
    const res = await svc.listAllForOwner('u1', { group: ScanGroup.RECON });
    const where = (prisma.scan.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.jobs.some.scannerName.notIn).toEqual(['shodan', 'holehe']);
    expect(res[0].jobs.map((j: { id: string }) => j.id)).toEqual(['j2']);
  });
});
