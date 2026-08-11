import type { TemplateDefinition } from '../types';

/**
 * Passive reconnaissance playlist (SP3a) — non-intrusive OSINT gathering on the
 * root target. Each step is a raw Kali tool run against the run's root target.
 */
export const ReconPassif: TemplateDefinition = {
  name: 'recon-passif',
  displayName: 'Recon passif',
  description:
    'OSINT passif sur la cible: dmitry (whois/netcraft/subdomains), theHarvester ' +
    '(emails/hosts, toutes sources), dnsenum (enum DNS).',
  steps: [
    { scannerName: 'dmitry', args: '-winsepfb' },
    { scannerName: 'theharvester', args: '-d {{target}} -b all' },
    { scannerName: 'dnsenum', args: '--noreverse' },
  ],
};
