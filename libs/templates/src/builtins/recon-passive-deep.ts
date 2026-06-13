import type { TemplateDefinition } from '../types';

/**
 * Phase 6.1 — broad passive subdomain discovery.
 *
 * Four enumerators (subfinder, assetfinder, findomain, amass-passive) plus a
 * puredns brute-force all run against the root `target`; the correlation
 * engine merges their findings into one Subdomain set (multi-source provenance
 * via AssetObservation). `dnsx` then resolves the union and `httpx`
 * fingerprints it. Steps are linear (Phase 2 execution model); the passive
 * tools are cheap so sequential cost is acceptable.
 */
export const ReconPassiveDeep: TemplateDefinition = {
  name: 'recon-passive-deep',
  displayName: 'Passive Recon (deep)',
  description:
    'Multi-source passive subdomain enumeration (subfinder, assetfinder, findomain, amass) + puredns brute-force, then DNS resolution and HTTP fingerprinting.',
  steps: [
    { scannerName: 'subfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'assetfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'findomain', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'amass', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'puredns',
      inputs: { mode: { kind: 'static', value: 'bruteforce' } },
      target: { kind: 'context', path: 'target' },
    },
    { scannerName: 'dnsx', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
  ],
};
