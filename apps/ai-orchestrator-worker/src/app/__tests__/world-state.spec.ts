import { WorldStateService } from '../world-state.service';

describe('WorldStateService', () => {
  function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
      scanJob: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { scannerName: 'nmap' },
            { scannerName: 'nmap' },
            { scannerName: 'httpx' },
          ]),
      },
      finding: {
        findMany: jest.fn().mockResolvedValue([{ title: 'Open SSH', severity: 'LOW' }]),
      },
      asset: {
        findFirst: jest.fn().mockResolvedValue({ id: 'asset-1' }),
      },
      endpoint: {
        findMany: jest.fn().mockResolvedValue([{ canonicalUrl: 'https://example.com/login' }]),
      },
      port: {
        findMany: jest.fn().mockResolvedValue([
          {
            number: 22,
            protocol: 'TCP',
            services: [{ name: 'ssh', version: '8.9' }],
          },
        ]),
      },
      technology: {
        findMany: jest.fn().mockResolvedValue([{ name: 'nginx', version: '1.25' }]),
      },
      ...overrides,
    } as any;
  }

  it('builds the shaped world state from prisma data', async () => {
    const prisma = makePrisma();
    const svc = new WorldStateService(prisma);

    const ws = await svc.build('run-1', 'eng-1', 'example.com');

    expect(ws.target).toBe('example.com');
    // scannersRun deduped.
    expect(ws.scannersRun).toEqual(['nmap', 'httpx']);
    expect(ws.openPorts).toEqual([{ port: 22, protocol: 'TCP' }]);
    expect(ws.services).toEqual([{ port: 22, name: 'ssh', version: '8.9' }]);
    expect(ws.technologies).toEqual([{ name: 'nginx', version: '1.25' }]);
    expect(ws.urls).toEqual(['https://example.com/login']);
    expect(ws.endpoints).toEqual(['https://example.com/login']);
    expect(ws.findings).toEqual([{ title: 'Open SSH', severity: 'LOW' }]);

    // Findings scoped to the run via the scanJob->scan relation.
    expect(prisma.finding.findMany).toHaveBeenCalledWith({
      where: { scanJob: { scan: { aiRunId: 'run-1' } } },
      select: { title: true, severity: true },
    });
  });

  it('returns empty host-scoped arrays when no matching asset exists', async () => {
    const prisma = makePrisma({
      asset: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const svc = new WorldStateService(prisma);

    const ws = await svc.build('run-1', 'eng-1', 'example.com');

    expect(ws.openPorts).toEqual([]);
    expect(ws.services).toEqual([]);
    expect(ws.technologies).toEqual([]);
    // Port/technology queries skipped entirely.
    expect(prisma.port.findMany).not.toHaveBeenCalled();
    expect(prisma.technology.findMany).not.toHaveBeenCalled();
  });
});
