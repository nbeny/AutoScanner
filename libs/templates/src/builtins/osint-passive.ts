import type { TemplateDefinition } from '../types';

/**
 * Phase 6.3 — passive OSINT. Certificate-transparency subdomains (crtsh) and
 * registrant/org metadata + emails (whois), both off the root target. Key-free.
 */
export const OsintPassive: TemplateDefinition = {
  name: 'osint-passive',
  displayName: 'Passive OSINT',
  description: 'Certificate-transparency subdomains (crtsh) and WHOIS org metadata + emails.',
  steps: [
    { scannerName: 'crtsh', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'whois', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
