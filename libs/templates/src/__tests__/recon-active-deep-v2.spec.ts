import { ReconActiveDeepV2 } from '../builtins/recon-active-deep-v2';
import { BUILTIN_TEMPLATES } from '../builtins';

describe('recon-active-deep-v2', () => {
  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES).toContain(ReconActiveDeepV2);
  });

  it('chains nmap → rustscan → dnsrecon → snmp-recon → onesixtyone → smb-enum → enum4linux-ng → ike-scan', () => {
    const names = ReconActiveDeepV2.steps.map((s) => s.scannerName);
    expect(names).toEqual([
      'nmap',
      'rustscan',
      'dnsrecon',
      'snmp-recon',
      'onesixtyone',
      'smb-enum',
      'enum4linux-ng',
      'ike-scan',
    ]);
  });

  it('surfaces a scope-acknowledgement banner', () => {
    expect(ReconActiveDeepV2.scopeAcknowledgement).toMatch(/engagement scope/i);
  });

  it('the ike-scan step declares requiresCapability=active-recon-host-net', () => {
    const ike = ReconActiveDeepV2.steps.find((s) => s.scannerName === 'ike-scan');
    expect(ike?.requiresCapability).toBe('active-recon-host-net');
  });

  it('no other step declares requiresCapability', () => {
    const others = ReconActiveDeepV2.steps.filter((s) => s.scannerName !== 'ike-scan');
    expect(others.every((s) => s.requiresCapability === undefined)).toBe(true);
  });
});
