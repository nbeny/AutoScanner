import type { TemplateDefinition } from '../types';

/**
 * Phase 6.4/6.5 — HTTP probe + TLS cert capture + app fingerprint + TLS/SSL
 * weakness scan over discovered hosts.
 *
 * Steps:
 *   1. httpx  — HTTP probe and technology detection.
 *   2. tlsx   — TLS certificate capture; emits expired/self-signed/weak-version findings.
 *   3. whatweb — Web application fingerprint (CMS, frameworks, server headers).
 *   4. sslscan — Full cipher-suite + protocol scan; flags weak protocols (SSLv2/3,
 *               TLSv1.0/1.1) and weak ciphers (RC4, NULL, EXPORT, DES, MD5, anon).
 */
export const WebFingerprint: TemplateDefinition = {
  name: 'web-fingerprint',
  displayName: 'Web Fingerprint',
  description:
    'HTTP fingerprint (httpx), TLS certificate capture (tlsx), app fingerprint (whatweb), and TLS/SSL weakness scan (sslscan).',
  steps: [
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    { scannerName: 'tlsx', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'whatweb', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'sslscan', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'webanalyze', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'subjs', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
