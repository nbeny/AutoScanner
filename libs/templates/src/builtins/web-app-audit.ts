import type { TemplateDefinition } from '../types';

export const WebAppAudit: TemplateDefinition = {
  name: 'web-app-audit',
  displayName: 'Web App Audit',
  description:
    'HTTP fingerprint (httpx), then CMS enumeration (wpscan), web-server misconfig scan (nikto), and HTTP parameter discovery (arjun).',
  steps: [
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    { scannerName: 'wpscan', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'nikto', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'arjun', inputs: {}, target: { kind: 'context', path: 'urls' } },
  ],
};
