import { SstiScanScanner } from '../ssti-scan.scanner';

const ctx = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('SstiScanScanner.build', () => {
  it('detect mode runs sstimap non-interactively against the target', () => {
    const { cmd } = SstiScanScanner.build({ level: 'detect' }, 'https://t.example/?name=x', ctx);
    const script = cmd.join(' ');
    expect(cmd[0]).toBe('sh');
    expect(script).toContain('sstimap');
    expect(script).toContain("'https://t.example/?name=x'");
    expect(script).toContain('--no-color');
    // never an interactive shell (would hang the container)
    expect(script).not.toContain('--os-shell');
    expect(script).not.toContain('--eval-shell');
    expect(script).not.toContain('--eval-code');
  });

  it('exploit mode enables non-interactive eval confirmation via --eval-code', () => {
    const { cmd } = SstiScanScanner.build({ level: 'exploit' }, 'https://t.example/', ctx);
    expect(cmd.join(' ')).toContain('--eval-code');
    expect(cmd.join(' ')).not.toContain('--eval-shell');
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
