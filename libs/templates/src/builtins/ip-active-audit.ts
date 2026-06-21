import type { TemplateDefinition } from '../types';

export const IpActiveAudit: TemplateDefinition = {
  name: 'ip-active-audit',
  displayName: 'IP Active Audit',
  description:
    'Full active security audit of a single IP address: full-port sweep (masscan), ' +
    'service detection (nmap), SSH/RDP/NetBIOS/TLS/SMB/SNMP/SMTP protocol audits, ' +
    'then web vulnerability scanning (httpx → nikto → nuclei → wafw00f → whatweb). ' +
    'Requires network access to the target.',
  steps: [
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
