import type { TemplateDefinition } from '../types';

/**
 * Phase 8.1 — deep passive attack-surface template chaining the existing
 * OSINT scanners. Enriched in phase 13A with `chaos` (after the GitHub
 * seeding block) and `urlfinder` (before dnstwist) so the template benefits
 * from ProjectDiscovery's subdomain dataset and passive URL archives.
 */
export const OsintPassiveDeep: TemplateDefinition = {
  name: 'osint-passive-deep',
  displayName: 'OSINT Passive (deep)',
  description:
    'Deep passive attack-surface: ASN/CIDR (asnmap), cloud buckets (cloud-enum), ' +
    'GitHub-leaked subdomains & secrets (github-subdomains, trufflehog), ' +
    'PD Chaos dataset, passive DNS (securitytrails), archive URLs (urlfinder). ' +
    'Credential-backed steps (GitHub, SecurityTrails, Chaos) are skipped/failed ' +
    'individually if no key is configured.',
  steps: [
    { scannerName: 'asnmap', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'cloud-enum', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'github-subdomains',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
    { scannerName: 'chaos', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'trufflehog', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'securitytrails',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
    { scannerName: 'metabigor', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'spiderfoot', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'urlfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'dnstwist', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
