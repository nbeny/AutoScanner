import type { TemplateDefinition } from '../types';

/** Phase 6.4 — HTTP probe + TLS cert capture + app fingerprint over discovered hosts. */
export const WebFingerprint: TemplateDefinition = {
  name: 'web-fingerprint',
  displayName: 'Web Fingerprint',
  description:
    'HTTP fingerprint (httpx), TLS certificate capture (tlsx), and app fingerprint (whatweb).',
  steps: [
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    { scannerName: 'tlsx', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'whatweb', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
  ],
};
