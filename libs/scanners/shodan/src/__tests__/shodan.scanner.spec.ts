import { ShodanScanner } from '../shodan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('ShodanScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(ShodanScanner.name).toBe('shodan');
    expect(ShodanScanner.docker.image).toBe('autoscanner/shodan:1.0');
    expect(ShodanScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'shodan-json',
    });
    expect(ShodanScanner.produces).toContain('OrgMetadata');
  });

  it('declares the SHODAN credential requirement', () => {
    expect(ShodanScanner.requiresCredential).toBe('SHODAN');
    expect(ShodanScanner.credentialEnvVar).toBe('SHODAN_API_KEY');
  });

  it('build() initializes the key then queries the domain', () => {
    const built = ShodanScanner.build(ShodanScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(built.cmd[0]).toBe('sh');
    expect(built.cmd[1]).toBe('-lc');
    // the script inits the key from the env var and queries the domain
    expect(built.cmd[2]).toContain('shodan init "$SHODAN_API_KEY"');
    expect(built.cmd[2]).toContain('shodan domain');
    expect(built.cmd[2]).toContain('example.com');
  });

  it('shell-escapes a malicious target (prevents injection)', () => {
    const malicious = 'a.com; rm -rf /';
    const built = ShodanScanner.build(ShodanScanner.inputSchema.parse({}), malicious, ctx);
    const script = built.cmd[2];
    // The target must be wrapped in single quotes so the shell cannot interpret
    // the semicolon as a command separator.
    expect(script).toContain("'a.com; rm -rf /'");
    // The target must NOT appear as a bare (unquoted) token after "shodan domain "
    // i.e. "shodan domain a.com; rm -rf /" must NOT be in the script
    expect(script).not.toMatch(/shodan domain a\.com; rm/);
  });
});
