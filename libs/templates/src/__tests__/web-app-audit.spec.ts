import { WebAppAudit } from '../builtins/web-app-audit';
import { BUILTIN_TEMPLATES } from '../builtins';

describe('web-app-audit template', () => {
  it('chains httpx → wpscan → nikto over subdomains, arjun over urls, git-dumper + exposed-config over target', () => {
    expect(WebAppAudit.name).toBe('web-app-audit');
    expect(WebAppAudit.steps.map((s) => s.scannerName)).toEqual([
      'httpx',
      'wpscan',
      'nikto',
      'arjun',
      'git-dumper',
      'exposed-config',
    ]);
    const arjun = WebAppAudit.steps.find((s) => s.scannerName === 'arjun');
    expect(arjun?.target).toEqual({ kind: 'context', path: 'urls' });
    const wpscan = WebAppAudit.steps.find((s) => s.scannerName === 'wpscan');
    expect(wpscan?.target).toEqual({ kind: 'context', path: 'subdomains' });
    const gitDumper = WebAppAudit.steps.find((s) => s.scannerName === 'git-dumper');
    expect(gitDumper?.target).toEqual({ kind: 'context', path: 'target' });
    const exposedConfig = WebAppAudit.steps.find((s) => s.scannerName === 'exposed-config');
    expect(exposedConfig?.target).toEqual({ kind: 'context', path: 'target' });
  });

  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.some((t) => t.name === 'web-app-audit')).toBe(true);
  });
});
