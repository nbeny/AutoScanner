import { ScansService } from '../scans.service';

describe('ScansService.scannerUsageStats', () => {
  it('agrège et trie par fréquence les combinaisons d’options', async () => {
    const rows = [
      { input: { ports: '80' } },
      { input: { ports: '80' } },
      { input: { ports: '1-65535' } },
      { input: {} },
    ];
    const prisma = { scanJob: { findMany: jest.fn().mockResolvedValue(rows) } };
    const svc = Object.create(ScansService.prototype) as ScansService;
    (svc as unknown as { prisma: unknown }).prisma = prisma;
    const stats = await svc.scannerUsageStats('u1', 'nmap');
    expect(stats[0]).toEqual({ optionsJson: JSON.stringify({ ports: '80' }), count: 2 });
    expect(stats.find((s) => s.optionsJson === '')?.count).toBe(1);
  });
});
