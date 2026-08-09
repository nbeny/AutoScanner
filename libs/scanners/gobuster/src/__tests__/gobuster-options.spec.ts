import { GobusterScanner } from '../gobuster.scanner';

describe('gobuster options enrichies', () => {
  it('expose threads/extensions et des presets', () => {
    const shape = (GobusterScanner.inputSchema as unknown as { shape: Record<string, unknown> })
      .shape;
    expect(shape['threads']).toBeDefined();
    expect(shape['extensions']).toBeDefined();
    expect(GobusterScanner.presets?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('build reste valide avec la cible seule (rétro-compatible)', () => {
    const { cmd } = GobusterScanner.build(GobusterScanner.inputSchema.parse({}), 'example.com', {
      scanJobId: 'j',
      engagementId: 'e',
      scratchDir: '/tmp',
    });
    expect(cmd).toEqual([
      'gobuster',
      'dir',
      '-u',
      'https://example.com',
      '-w',
      '/etc/gobuster/content.txt',
      '-q',
      '--no-color',
      '-o',
      '/dev/stdout',
    ]);
  });

  it('build applique threads et extensions quand fournis', () => {
    const input = GobusterScanner.inputSchema.parse({ threads: 50, extensions: 'php,html' });
    const { cmd } = GobusterScanner.build(input, 'example.com', {
      scanJobId: 'j',
      engagementId: 'e',
      scratchDir: '/tmp',
    });
    expect(cmd).toContain('-t');
    expect(cmd).toContain('50');
    expect(cmd).toContain('-x');
    expect(cmd).toContain('php,html');
  });
});
