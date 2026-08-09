import { HttpxScanner } from '../httpx.scanner';

describe('httpx presets', () => {
  it('expose au moins 2 presets curés', () => {
    expect(HttpxScanner.presets?.length ?? 0).toBeGreaterThanOrEqual(2);
    const ids = HttpxScanner.presets?.map((p) => p.id) ?? [];
    expect(ids).toContain('probe-basic');
    expect(ids).toContain('full-fingerprint');
  });

  it('le preset full-fingerprint applique tech-detect/title/sc au build', () => {
    const preset = HttpxScanner.presets?.find((p) => p.id === 'full-fingerprint');
    expect(preset).toBeDefined();
    const input = HttpxScanner.inputSchema.parse(preset?.options ?? {});
    const { cmd } = HttpxScanner.build(input, 'example.com', {
      scanJobId: 'j',
      engagementId: 'e',
      scratchDir: '/tmp',
    });
    expect(cmd).toContain('-tech-detect');
    expect(cmd).toContain('-title');
    expect(cmd).toContain('-sc');
  });
});
