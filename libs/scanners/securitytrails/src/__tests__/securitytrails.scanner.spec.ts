import { SecuritytrailsScanner } from '../securitytrails.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('SecuritytrailsScanner', () => {
  it('requires SECURITYTRAILS key as SECURITYTRAILS_API_KEY; JSON → securitytrails-json; produces Subdomain', () => {
    expect(SecuritytrailsScanner.name).toBe('securitytrails');
    expect(SecuritytrailsScanner.requiresCredential).toBe('SECURITYTRAILS');
    expect(SecuritytrailsScanner.credentialEnvVar).toBe('SECURITYTRAILS_API_KEY');
    expect(SecuritytrailsScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'securitytrails-json',
    });
    expect(SecuritytrailsScanner.produces).toEqual(expect.arrayContaining(['Subdomain']));
  });

  it('build() curls the subdomains endpoint with the APIKEY header and quoted domain', () => {
    const { cmd } = SecuritytrailsScanner.build(
      SecuritytrailsScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain('api.securitytrails.com/v1/domain/');
    expect(cmd[2]).toContain('"APIKEY: $SECURITYTRAILS_API_KEY"');
    expect(cmd[2]).toContain("'example.com'");
  });
});
