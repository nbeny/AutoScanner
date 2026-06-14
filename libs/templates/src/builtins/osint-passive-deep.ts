import type { TemplateDefinition } from '../types';

/**
 * Phase 8.1 — deep passive attack-surface template chaining all 5 new OSINT
 * scanners.  Credential-backed steps (GitHub, SecurityTrails) are skipped /
 * failed individually at runtime if no API key is configured.
 */
export const OsintPassiveDeep: TemplateDefinition = {
  name: 'osint-passive-deep',
  displayName: 'OSINT Passive (deep)',
  description:
    'Deep passive attack-surface: ASN/CIDR (asnmap), cloud buckets (cloud-enum), ' +
    'GitHub-leaked subdomains & secrets (github-subdomains, trufflehog), passive DNS (securitytrails). ' +
    'Credential-backed steps (GitHub, SecurityTrails) are skipped/failed individually if no key is configured.',
  steps: [
    { scannerName: 'asnmap', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'cloud-enum', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'github-subdomains',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
    { scannerName: 'trufflehog', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'securitytrails',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
  ],
};
