import { IpPassiveIntel } from '../builtins/ip-passive-intel';
import { BUILTIN_TEMPLATES } from '../builtins';

describe('ip-passive-intel template', () => {
  it('runs abuseipdb then greynoise', () => {
    expect(IpPassiveIntel.name).toBe('ip-passive-intel');
    expect(IpPassiveIntel.steps.map((s) => s.scannerName)).toEqual(['abuseipdb', 'greynoise']);
  });

  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.some((t) => t.name === 'ip-passive-intel')).toBe(true);
  });
});
