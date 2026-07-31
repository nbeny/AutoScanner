import { WebAppAudit } from '../web-app-audit';
import { BUILTIN_TEMPLATES } from '../index';

describe('WebAppAudit template', () => {
  it('appears in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('web-app-audit');
  });

  it('chains 6 steps in expected order', () => {
    expect(WebAppAudit.steps.map((s) => s.scannerName)).toEqual([
      'httpx',
      'wpscan',
      'nikto',
      'arjun',
      'git-dumper',
      'exposed-config',
    ]);
  });

  it('httpx probes subdomains as the first step', () => {
    expect(WebAppAudit.steps[0]).toEqual({
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    });
  });

  it('wpscan and nikto target subdomains, arjun targets urls', () => {
    const wpscan = WebAppAudit.steps.find((s) => s.scannerName === 'wpscan');
    const nikto = WebAppAudit.steps.find((s) => s.scannerName === 'nikto');
    const arjun = WebAppAudit.steps.find((s) => s.scannerName === 'arjun');
    expect(wpscan?.target).toEqual({ kind: 'context', path: 'subdomains' });
    expect(nikto?.target).toEqual({ kind: 'context', path: 'subdomains' });
    expect(arjun?.target).toEqual({ kind: 'context', path: 'urls' });
  });

  it('git-dumper and exposed-config target the engagement root', () => {
    const gitDumper = WebAppAudit.steps.find((s) => s.scannerName === 'git-dumper');
    const exposedConfig = WebAppAudit.steps.find((s) => s.scannerName === 'exposed-config');
    expect(gitDumper?.target).toEqual({ kind: 'context', path: 'target' });
    expect(gitDumper?.inputs).toEqual({});
    expect(exposedConfig?.target).toEqual({ kind: 'context', path: 'target' });
    expect(exposedConfig?.inputs).toEqual({});
  });
});
