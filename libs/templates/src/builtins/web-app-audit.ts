import type { TemplateDefinition } from '../types';

export const WebAppAudit: TemplateDefinition = {
  name: 'web-app-audit',
  displayName: 'Web App Audit',
  description:
    'HTTP fingerprint (httpx), then CMS enumeration (wpscan), web-server misconfig scan (nikto), ' +
    'HTTP parameter discovery (arjun), exposed .git/ dump (git-dumper), and exposed ' +
    'config/backup/dotfile sweep (exposed-config).',
  steps: [
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    { scannerName: 'wpscan', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'nikto', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'arjun', inputs: {}, target: { kind: 'context', path: 'urls' } },
    { scannerName: 'git-dumper', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'exposed-config', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
