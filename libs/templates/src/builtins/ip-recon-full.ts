import type { TemplateDefinition } from '../types';

export const IpReconFull: TemplateDefinition = {
  name: 'ip-recon-full',
  displayName: 'IP Recon Full',
  description:
    'Complete IP recon in one command: passive reputation first (abuseipdb, greynoise), ' +
    'then full active audit (masscan, nmap, protocol audits, web scanning). ' +
    'Runs sequentially. For simultaneous passive + active, fire ip-passive-intel ' +
    'and ip-active-audit as two separate runTemplate mutations on the same engagement.',
  steps: [
    { scannerName: 'abuseipdb', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'greynoise', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'masscan', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'nmap',
      inputs: { serviceDetection: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'target' },
    },
    { scannerName: 'ssh-audit', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'nbtscan', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'rdp-sec-check', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'sslscan', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'smb-enum', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'snmp-recon', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'smtp-recon', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'httpx', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'nikto', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'nuclei', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'wafw00f', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'whatweb', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
