import { SqliScanScanner } from '../sqli-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('SqliScanScanner', () => {
  it('uses custom image, TEXT to sqlmap-json, produces Finding, no cred', () => {
    expect(SqliScanScanner.name).toBe('sqli-scan');
    expect(SqliScanScanner.docker.image).toBe('autoscanner/sqli-scan:1.0');
    expect(SqliScanScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'sqlmap-json',
    });
    expect(SqliScanScanner.produces).toEqual(['Finding']);
    expect(SqliScanScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs sqlmap with quoted url, detect defaults (level1/risk1, no --dump)', () => {
    const { cmd } = SqliScanScanner.build(
      SqliScanScanner.inputSchema.parse({}),
      'https://x.test/?id=1',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('sqlmap');
    expect(cmd[2]).toContain("-u 'https://x.test/?id=1'");
    expect(cmd[2]).toContain('--batch');
    expect(cmd[2]).toContain('--level 1');
    expect(cmd[2]).toContain('--risk 1');
    expect(cmd[2]).not.toContain('--dump');
    expect(cmd[2]).not.toContain('--os-shell');
  });

  it('aggressive raises level/risk but never --dump/--os-shell', () => {
    const { cmd } = SqliScanScanner.build(
      SqliScanScanner.inputSchema.parse({ level: 'aggressive' }),
      'https://x.test',
      ctx,
    );
    expect(cmd[2]).toContain('--level 3');
    expect(cmd[2]).toContain('--risk 2');
    expect(cmd[2]).not.toContain('--dump');
    expect(cmd[2]).not.toContain('--os-shell');
  });

  it('passes the session cookie via --cookie when auth is configured', () => {
    const { cmd } = SqliScanScanner.build(SqliScanScanner.inputSchema.parse({}), 'https://x.test', {
      ...ctx,
      auth: { cookie: 'session=abc' },
    });
    expect(cmd[2]).toContain("--cookie='session=abc'");
  });

  it('omits --cookie when no auth is configured', () => {
    const { cmd } = SqliScanScanner.build(
      SqliScanScanner.inputSchema.parse({}),
      'https://x.test',
      ctx,
    );
    expect(cmd[2]).not.toContain('--cookie');
  });
});
