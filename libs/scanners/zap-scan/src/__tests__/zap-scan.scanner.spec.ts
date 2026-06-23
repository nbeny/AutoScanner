import { ZapScanScanner } from '../zap-scan.scanner';

const ctx = { scanJobId: 'j', engagementId: 'e', scratchDir: '/output' };

describe('ZapScanScanner.build', () => {
  it('baseline mode uses zap-baseline.py and writes the captured report', () => {
    const { cmd } = ZapScanScanner.build({ mode: 'baseline' }, 'https://t.example', ctx);
    const script = cmd.join(' ');
    expect(cmd[0]).toBe('sh');
    expect(script).toContain('zap-baseline.py');
    expect(script).not.toContain('zap-full-scan.py');
    expect(script).toContain('/output/zap.json');
    expect(script).toContain("-t 'https://t.example'");
  });

  it('full mode uses zap-full-scan.py (active attack)', () => {
    const { cmd } = ZapScanScanner.build({ mode: 'full' }, 'https://t.example', ctx);
    expect(cmd.join(' ')).toContain('zap-full-scan.py');
  });

  it('forces exit 0 so vuln-found exit codes do not mark the job FAILED', () => {
    const { cmd } = ZapScanScanner.build({ mode: 'full' }, 'https://t.example', ctx);
    expect(cmd.join(' ')).toMatch(/\|\| true|; true/);
  });

  it('shell-quotes a malicious target safely', () => {
    const { cmd } = ZapScanScanner.build({ mode: 'baseline' }, "x'; rm -rf /", ctx);
    expect(cmd.join(' ')).toContain("'x'\\''; rm -rf /'");
  });
});
