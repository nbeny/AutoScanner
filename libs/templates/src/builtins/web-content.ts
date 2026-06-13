import type { TemplateDefinition } from '../types';

/**
 * Phase 6.2 — web content / endpoint discovery.
 *
 * httpx probes the discovered subdomains, then katana (crawl), gau (archived
 * URLs), ffuf (directory fuzzing), and gobuster (directory brute-forcing)
 * enumerate endpoints over the same host set. Discovered Endpoints are merged
 * by canonical URL in the persister.
 */
export const WebContent: TemplateDefinition = {
  name: 'web-content',
  displayName: 'Web Content Discovery',
  description:
    'HTTP fingerprint (httpx) then endpoint discovery via crawl (katana), web archives (gau), directory fuzzing (ffuf), and directory brute-forcing (gobuster).',
  steps: [
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    { scannerName: 'katana', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'gau', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'ffuf', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'gobuster', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
  ],
};
