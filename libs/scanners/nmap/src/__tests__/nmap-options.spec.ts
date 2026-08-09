import { NmapScanner } from '../nmap.scanner';

describe('nmap presets', () => {
  it('expose au moins 2 presets curés avec des options valides', () => {
    expect(NmapScanner.presets?.length ?? 0).toBeGreaterThanOrEqual(2);
    const ids = NmapScanner.presets?.map((p) => p.id) ?? [];
    expect(ids).toContain('quick-top-1000');
    expect(ids).toContain('full-tcp-scripts');
  });

  it('les options du preset full-tcp-scripts appliquées au build produisent la commande attendue', () => {
    const preset = NmapScanner.presets?.find((p) => p.id === 'full-tcp-scripts');
    expect(preset).toBeDefined();
    const input = NmapScanner.inputSchema.parse(preset?.options ?? {});
    const { cmd } = NmapScanner.build(input, 'example.com', {
      scanJobId: 'j',
      engagementId: 'e',
      scratchDir: '/tmp',
    });
    expect(cmd).toContain('-sV');
    expect(cmd).toContain('-O');
    expect(cmd).toContain('--script');
    expect(cmd).toContain('default');
    expect(cmd).toContain('1-65535');
  });
});
