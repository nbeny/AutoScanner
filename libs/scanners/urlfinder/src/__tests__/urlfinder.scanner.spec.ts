import { UrlfinderScanner } from '../urlfinder.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('UrlfinderScanner', () => {
  it('declares name, image, TEXT → urllines-text, no credential required', () => {
    expect(UrlfinderScanner.name).toBe('urlfinder');
    expect(UrlfinderScanner.docker.image).toBe('autoscanner/urlfinder:1.0');
    expect(UrlfinderScanner.docker.readonlyRootfs).toBe(true);
    expect(UrlfinderScanner.docker.defaultTimeoutMs).toBe(600_000);
    expect(UrlfinderScanner.requiresCredential).toBeUndefined();
    expect(UrlfinderScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'urllines-text',
    });
    expect(UrlfinderScanner.produces).toEqual(['Endpoint']);
  });

  it('build() runs urlfinder -d <domain> -silent and shell-escapes the domain', () => {
    const input = UrlfinderScanner.inputSchema.parse({});
    const { cmd } = UrlfinderScanner.build(input, 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('urlfinder');
    expect(cmd[2]).toContain("-d 'example.com'");
    expect(cmd[2]).toContain('-silent');
  });

  it('build() passes optional PDCP_API_KEY (CHAOS) for enrichment when present in env', () => {
    const input = UrlfinderScanner.inputSchema.parse({});
    const { cmd } = UrlfinderScanner.build(input, 'example.com', ctx);
    // The script references CHAOS_API_KEY so the worker-injected env is consumed.
    expect(cmd[2]).toContain('PDCP_API_KEY="${CHAOS_API_KEY:-}"');
  });
});
