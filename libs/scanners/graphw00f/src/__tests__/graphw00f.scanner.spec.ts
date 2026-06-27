import { Graphw00fScanner } from '../graphw00f.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('Graphw00fScanner', () => {
  it('declares name, image, JSON file → graphw00f-json, produces Endpoint + Technology', () => {
    expect(Graphw00fScanner.name).toBe('graphw00f');
    expect(Graphw00fScanner.docker.image).toBe('autoscanner/graphw00f:1.0');
    expect(Graphw00fScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: { path: '/out/result.json' },
      parser: 'graphw00f-json',
    });
    expect(Graphw00fScanner.produces).toEqual(['Endpoint', 'Technology']);
  });

  it('build() runs main.py with -d -f flags by default', () => {
    const input = Graphw00fScanner.inputSchema.parse({});
    const { cmd } = Graphw00fScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toEqual([
      'python',
      '/opt/graphw00f/main.py',
      '-d',
      '-f',
      '-t',
      'https://acme.tld',
      '-o',
      '/out/result.json',
    ]);
  });

  it('build() omits -d when detect=false', () => {
    const input = Graphw00fScanner.inputSchema.parse({ detect: false });
    const { cmd } = Graphw00fScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).not.toContain('-d');
    expect(cmd).toContain('-f');
  });

  it('build() omits -f when fingerprint=false', () => {
    const input = Graphw00fScanner.inputSchema.parse({ fingerprint: false });
    const { cmd } = Graphw00fScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toContain('-d');
    expect(cmd).not.toContain('-f');
  });
});
