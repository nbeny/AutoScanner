import { IpReconFull } from '../builtins/ip-recon-full';
import { IpActiveAudit } from '../builtins/ip-active-audit';
import { IpPassiveIntel } from '../builtins/ip-passive-intel';
import { BUILTIN_TEMPLATES } from '../builtins';

describe('ip-recon-full template', () => {
  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.some((t) => t.name === 'ip-recon-full')).toBe(true);
  });

  it('includes all steps from ip-passive-intel and ip-active-audit', () => {
    const names = IpReconFull.steps.map((s) => s.scannerName);
    const passiveNames = IpPassiveIntel.steps.map((s) => s.scannerName);
    const activeNames = IpActiveAudit.steps.map((s) => s.scannerName);
    for (const n of [...passiveNames, ...activeNames]) {
      expect(names).toContain(n);
    }
  });

  it('passive intel steps come before active steps', () => {
    const names = IpReconFull.steps.map((s) => s.scannerName);
    expect(names.indexOf('abuseipdb')).toBeLessThan(names.indexOf('masscan'));
    expect(names.indexOf('greynoise')).toBeLessThan(names.indexOf('masscan'));
  });
});
