import { JwtToolScanner } from '../jwt-tool.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('JwtToolScanner', () => {
  it('declares name, image, TEXT file → jwt-tool-text, produces Finding', () => {
    expect(JwtToolScanner.name).toBe('jwt-tool');
    expect(JwtToolScanner.docker.image).toBe('autoscanner/jwt-tool:1.0');
    expect(JwtToolScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: { path: '/out/result.txt' },
      parser: 'jwt-tool-text',
    });
    expect(JwtToolScanner.produces).toEqual(['Finding']);
  });

  it('build() decodes + cracks the token offline', () => {
    const input = JwtToolScanner.inputSchema.parse({
      token: 'eyJhbGciOiJIUzI1NiJ9.e30.abc',
    });
    const { cmd } = JwtToolScanner.build(input, 'https://api.example/', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain("'eyJhbGciOiJIUzI1NiJ9.e30.abc'");
    expect(cmd[2]).toContain('-C -d /opt/wordlists/jwt-secrets.txt');
    expect(cmd[2]).toContain('> /out/result.txt');
  });

  it('build() writes NO_TOKEN sentinel when token is empty', () => {
    const input = JwtToolScanner.inputSchema.parse({});
    const { cmd } = JwtToolScanner.build(input, 'https://api.example/', ctx);
    expect(cmd[2]).toContain('NO_TOKEN');
    expect(cmd[2]).not.toContain('-C -d');
  });

  it('rejects a token containing shell metacharacters', () => {
    expect(() => JwtToolScanner.inputSchema.parse({ token: 'abc; rm -rf /' })).toThrow();
  });
});
