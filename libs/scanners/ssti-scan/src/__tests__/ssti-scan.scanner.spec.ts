import { SstiScanScanner } from '../ssti-scan.scanner';

const ctx = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('SstiScanScanner.build', () => {
  it('detect mode runs sstimap non-interactively against the target', () => {
    const { cmd } = SstiScanScanner.build({ level: 'detect' }, 'https://t.example/?name=x', ctx);
    const script = cmd.join(' ');
    expect(cmd[0]).toBe('sh');
    expect(script).toContain('sstimap');
    expect(script).toContain("'https://t.example/?name=x'");
    expect(script).not.toContain('--os-shell');
  });

  it('exploit mode enables eval confirmation', () => {
    const { cmd } = SstiScanScanner.build({ level: 'exploit' }, 'https://t.example/', ctx);
    expect(cmd.join(' ')).toContain('--eval');
  });

  it('shell-quotes a malicious target safely', () => {
    const { cmd } = SstiScanScanner.build({ level: 'detect' }, "x'; rm -rf /", ctx);
    expect(cmd.join(' ')).toContain("'x'\\''; rm -rf /'");
  });

  it('attaches session headers (-H) for authenticated scanning', () => {
    const { cmd } = SstiScanScanner.build({ level: 'detect' }, 'https://t.example/', {
      ...ctx,
      auth: { cookie: 'session=abc', headers: { Authorization: 'Bearer xyz' } },
    });
    expect(cmd[2]).toContain("-H 'Cookie: session=abc'");
    expect(cmd[2]).toContain("-H 'Authorization: Bearer xyz'");
  });
});
