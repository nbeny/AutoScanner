import type { TemplateDefinition } from '../types';

/**
 * Phase 6.4/6.5 + Phase 13C enrichment:
 *   1. httpx       — HTTP probe + tech detect.
 *   2. feroxbuster — quick-mode content discovery (depth 1, bundled top-1000 wordlist).
 *   3. tlsx        — TLS certificate capture.
 *   4. whatweb     — app fingerprint.
 *   5. sslscan     — TLS/SSL weakness scan.
 *   6. webanalyze  — Wappalyzer-style fingerprint.
 *   7. subjs       — JS endpoint extraction.
 */
export const WebFingerprint: TemplateDefinition = {
  name: 'web-fingerprint',
  displayName: 'Web Fingerprint',
  description:
    'HTTP fingerprint (httpx), quick content discovery (feroxbuster depth 1), TLS cert capture (tlsx), ' +
    'app fingerprint (whatweb), TLS/SSL weakness scan (sslscan), Wappalyzer-style fingerprint (webanalyze), ' +
    'JS endpoint extraction (subjs).',
  steps: [
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    {
      scannerName: 'feroxbuster',
      inputs: { depth: { kind: 'static', value: 1 } },
      target: { kind: 'context', path: 'target' },
    },
    { scannerName: 'tlsx', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'whatweb', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'sslscan', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'webanalyze', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'subjs', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
