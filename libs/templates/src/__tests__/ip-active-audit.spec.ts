import { IpActiveAudit } from '../builtins/ip-active-audit';
import { BUILTIN_TEMPLATES } from '../builtins';

describe('ip-active-audit template', () => {
  it('starts with masscan then nmap', () => {
    expect(IpActiveAudit.name).toBe('ip-active-audit');
    expect(IpActiveAudit.steps[0].scannerName).toBe('masscan');
    expect(IpActiveAudit.steps[1].scannerName).toBe('nmap');
  });

  it('includes ssh-audit, nbtscan, rdp-sec-check', () => {
    const names = IpActiveAudit.steps.map((s) => s.scannerName);
    expect(names).toContain('ssh-audit');
    expect(names).toContain('nbtscan');
    expect(names).toContain('rdp-sec-check');
  });

  it('includes web audit scanners (httpx, nikto, nuclei)', () => {
    const names = IpActiveAudit.steps.map((s) => s.scannerName);
    expect(names).toContain('httpx');
    expect(names).toContain('nikto');
    expect(names).toContain('nuclei');
  });

  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.some((t) => t.name === 'ip-active-audit')).toBe(true);
  });

  it('all steps use context target', () => {
    IpActiveAudit.steps.forEach((step) => {
      expect(step.target).toEqual({ kind: 'context', path: 'target' });
    });
  });
});
