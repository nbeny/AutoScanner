import { FofaScanner } from '../fofa.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('FofaScanner', () => {
  it('declares name, image, JSON → fofa-json, requires FOFA cred', () => {
    expect(FofaScanner.name).toBe('fofa');
    expect(FofaScanner.docker.image).toBe('autoscanner/fofa:1.0');
    expect(FofaScanner.docker.readonlyRootfs).toBe(true);
    expect(FofaScanner.requiresCredential).toBe('FOFA');
    expect(FofaScanner.credentialEnvVar).toBe('FOFA_CREDENTIAL');
    expect(FofaScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'fofa-json',
    });
    expect(FofaScanner.produces).toEqual(expect.arrayContaining(['Asset']));
  });

  it('build() exports query+size + splits FOFA_CREDENTIAL into email:key inside the container', () => {
    const input = FofaScanner.inputSchema.parse({ query: 'domain="example.com"', size: 250 });
    const { cmd } = FofaScanner.build(input, 'example.com', ctx);
    expect(cmd[2]).toContain('FOFA_EMAIL=');
    expect(cmd[2]).toContain('FOFA_KEY=');
    expect(cmd[2]).toContain('FOFA_QUERY=');
    expect(cmd[2]).toContain('FOFA_SIZE=250');
    // The credential MUST come from env, never argv:
    expect(cmd[2]).not.toMatch(/--email|--key/);
    expect(cmd[2]).toContain('fofa-client.py');
  });

  it('rejects size above 10000', () => {
    expect(() => FofaScanner.inputSchema.parse({ query: 'x', size: 99999 })).toThrow();
  });

  it('defaults size to 100', () => {
    const input = FofaScanner.inputSchema.parse({ query: 'x' });
    expect(input.size).toBe(100);
  });
});
