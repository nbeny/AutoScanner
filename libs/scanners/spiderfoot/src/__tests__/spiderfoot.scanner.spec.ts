import { SpiderfootScanner } from '../spiderfoot.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('SpiderfootScanner', () => {
  it('declares name, image, JSON stdout → spiderfoot-json, produces multiple entities', () => {
    expect(SpiderfootScanner.name).toBe('spiderfoot');
    expect(SpiderfootScanner.docker.image).toBe('autoscanner/spiderfoot:1.0');
    expect(SpiderfootScanner.docker.readonlyRootfs).toBe(false);
    expect(SpiderfootScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'spiderfoot-json',
    });
    expect(SpiderfootScanner.produces).toEqual(
      expect.arrayContaining(['Finding', 'Asset', 'Email', 'IpAddress']),
    );
    expect(SpiderfootScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs the one-shot CLI with the default key-free module set, JSON output', () => {
    const { cmd } = SpiderfootScanner.build(
      SpiderfootScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('python3 ./sf.py');
    expect(cmd[2]).toContain("-s 'example.com'");
    expect(cmd[2]).toContain('-m sfp_dnsresolve');
    expect(cmd[2]).toContain('-o json');
    expect(cmd[2]).not.toContain('sf.py --listen');
  });

  it('build() passes a custom module list through', () => {
    const { cmd } = SpiderfootScanner.build(
      SpiderfootScanner.inputSchema.parse({ modules: 'sfp_crt,sfp_whois' }),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain('-m sfp_crt,sfp_whois');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = SpiderfootScanner.build(
      SpiderfootScanner.inputSchema.parse({}),
      'a.com; id',
      ctx,
    );
    expect(cmd[2]).toContain("'a.com; id'");
  });
});
