import { IpReconFullChain } from '../builtins/ip-recon-full';
import { validateChain } from '../schema';

describe('ip-recon-full chain', () => {
  it('is a valid chain definition', () => {
    expect(() => validateChain(IpReconFullChain)).not.toThrow();
  });

  it('nmap targets non-CDN IPs after cdncheck', () => {
    const steps = IpReconFullChain.steps;
    expect(steps.map((s) => s.id)).toEqual(['theharvester', 'cdncheck', 'nmap']);
    const nmap = steps.find((s) => s.id === 'nmap')!;
    expect(nmap.target.from).toBe('ipAddresses');
    expect(nmap.target.filter).toEqual([{ pred: 'notBehindCdn' }]);
  });
});
