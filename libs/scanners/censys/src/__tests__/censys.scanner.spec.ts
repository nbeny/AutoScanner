import { CensysScanner } from '../censys.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('CensysScanner', () => {
  it('declares name, displayName, docker image, outputs, produces', () => {
    expect(CensysScanner.name).toBe('censys');
    expect(CensysScanner.displayName).toBe('Censys');
    expect(CensysScanner.docker.image).toBe('autoscanner/censys:1.0');
    expect(CensysScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'censys-json',
    });
    expect(CensysScanner.produces).toContain('OrgMetadata');
  });

  it('declares the CENSYS credential requirement', () => {
    expect(CensysScanner.requiresCredential).toBe('CENSYS');
    expect(CensysScanner.credentialEnvVar).toBe('CENSYS_API_CRED');
  });

  it('build() splits the colon-joined cred and searches hosts for the domain', () => {
    const built = CensysScanner.build(CensysScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(built.cmd[0]).toBe('sh');
    expect(built.cmd[1]).toBe('-lc');
    const script = built.cmd[2];
    expect(script).toContain('CENSYS_API_ID');
    expect(script).toContain('CENSYS_API_SECRET');
    expect(script).toContain('censys search');
    expect(script).toContain('example.com');
  });

  it('shell-escapes a malicious target (prevents injection)', () => {
    const malicious = 'a.com; rm -rf /';
    const built = CensysScanner.build(CensysScanner.inputSchema.parse({}), malicious, ctx);
    const script = built.cmd[2];
    // The target must be wrapped in single quotes
    expect(script).toContain("'a.com; rm -rf /'");
    // Must NOT appear as a bare token after "censys search "
    expect(script).not.toMatch(/censys search a\.com; rm/);
  });
});
