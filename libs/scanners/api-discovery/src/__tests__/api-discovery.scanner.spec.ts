import { ApiDiscoveryScanner } from '../api-discovery.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('ApiDiscoveryScanner', () => {
  it('declares name, docker image, TEXT output → kiterunner-text parser, produces Endpoint', () => {
    expect(ApiDiscoveryScanner.name).toBe('api-discovery');
    expect(ApiDiscoveryScanner.docker.image).toBe('autoscanner/api-discovery:1.0');
    expect(ApiDiscoveryScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'kiterunner-text',
    });
    expect(ApiDiscoveryScanner.produces).toEqual(expect.arrayContaining(['Endpoint']));
    expect(ApiDiscoveryScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs kr scan with shell-quoted target via sh -lc', () => {
    const { cmd } = ApiDiscoveryScanner.build(
      ApiDiscoveryScanner.inputSchema.parse({}),
      'https://api.example.com',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('kr scan');
    expect(cmd[2]).toContain("'https://api.example.com'");
    expect(cmd[2]).toContain('-w /wordlists/routes-small.kite');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = ApiDiscoveryScanner.build(
      ApiDiscoveryScanner.inputSchema.parse({}),
      "https://api.example.com'; rm -rf /",
      ctx,
    );
    expect(cmd[2]).toContain("'https://api.example.com'\\''");
  });
});
