import { PwncatScanner } from './pwncat.scanner';
import { ScannerCategory, type BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j1', engagementId: 'e1', scratchDir: '/tmp' };

describe('PwncatScanner', () => {
  it('declares identity, TEXT/stdout → pwncat-text parser, produces Finding', () => {
    expect(PwncatScanner.name).toBe('pwncat');
    expect(PwncatScanner.docker.image).toBe('autoscanner/pwncat:1.0');
    expect(PwncatScanner.category).toEqual([ScannerCategory.VULN_SCAN]);
    expect(PwncatScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'pwncat-text',
    });
    expect(PwncatScanner.produces).toContain('Finding');
  });

  it('build() runs a bounded, non-interactive pwncat-nc probe against target:port', () => {
    const { cmd } = PwncatScanner.build({ port: 4444, probe: 'id' }, '10.0.0.5', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-c');
    expect(cmd[2]).toContain('pwncat-nc');
    expect(cmd[2]).toContain('10.0.0.5');
    expect(cmd[2]).toContain('4444');
    expect(cmd[2]).toContain('timeout');
  });

  it('inputSchema rejects a missing/invalid port and accepts { port: 4444 }', () => {
    expect(PwncatScanner.inputSchema.safeParse({}).success).toBe(false);
    expect(PwncatScanner.inputSchema.safeParse({ port: -1 }).success).toBe(false);
    expect(PwncatScanner.inputSchema.safeParse({ port: 'x' }).success).toBe(false);
    const ok = PwncatScanner.inputSchema.safeParse({ port: 4444 });
    expect(ok.success).toBe(true);
    // probe defaults to 'id'
    expect(ok.success && ok.data.probe).toBe('id');
  });
});
