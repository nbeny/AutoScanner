import { NucleiScanner } from '../nuclei.scanner';

describe('nuclei presets', () => {
  it('expose au moins 2 presets curés', () => {
    expect(NucleiScanner.presets?.length ?? 0).toBeGreaterThanOrEqual(2);
    const ids = NucleiScanner.presets?.map((p) => p.id) ?? [];
    expect(ids).toContain('cves-critical-high');
    expect(ids).toContain('exposures');
  });

  it('les options du preset cves-critical-high appliquées au build produisent la commande attendue', () => {
    const preset = NucleiScanner.presets?.find((p) => p.id === 'cves-critical-high');
    expect(preset).toBeDefined();
    const input = NucleiScanner.inputSchema.parse(preset?.options ?? {});
    const { cmd } = NucleiScanner.build(input, 'example.com', {
      scanJobId: 'j',
      engagementId: 'e',
      scratchDir: '/tmp',
    });
    expect(cmd).toContain('-severity');
    expect(cmd).toContain('critical,high');
    expect(cmd).toContain('-tags');
    expect(cmd).toContain('cve');
  });
});
