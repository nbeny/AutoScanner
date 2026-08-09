import { FfufScanner } from '../ffuf.scanner';

describe('ffuf options enrichies', () => {
  it('expose threads/extensions et des presets', () => {
    const shape = (FfufScanner.inputSchema as unknown as { shape: Record<string, unknown> }).shape;
    expect(shape['threads']).toBeDefined();
    expect(shape['extensions']).toBeDefined();
    expect(FfufScanner.presets?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('build applique threads et extensions', () => {
    const res = FfufScanner.build(
      { wordlist: '/w.txt', matchCodes: '200', threads: 80, extensions: 'php,html' } as never,
      'ex.com',
      { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' },
    );
    expect(res.cmd).toContain('-t');
    expect(res.cmd).toContain('80');
    expect(res.cmd).toContain('-e');
    expect(res.cmd).toContain('php,html');
  });
});
