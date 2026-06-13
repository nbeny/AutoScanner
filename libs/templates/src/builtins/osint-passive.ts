import type { TemplateDefinition } from '../types';

/**
 * Phase 6.3/6.5 — passive OSINT off the root target (key-free):
 * certificate-transparency subdomains (crtsh), registrant/org metadata + emails
 * (whois), and OSINT emails/hosts from public sources (theHarvester).
 */
export const OsintPassive: TemplateDefinition = {
  name: 'osint-passive',
  displayName: 'Passive OSINT',
  description:
    'CT subdomains (crtsh), WHOIS org metadata + emails, and OSINT emails (theHarvester).',
  steps: [
    { scannerName: 'crtsh', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'whois', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'theharvester', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
