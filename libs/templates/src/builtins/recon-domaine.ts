import type { TemplateDefinition } from '../types';

/**
 * Domain reconnaissance playlist (SP3a) — subdomain/DNS enumeration on the root
 * domain. Passive by default; `amass enum -passive` avoids active resolution.
 */
export const ReconDomaine: TemplateDefinition = {
  name: 'recon-domaine',
  displayName: 'Recon domaine',
  description:
    'Enumeration de domaine: amass (enum passif), dnsrecon (records + AXFR/SRV), ' +
    'fierce (brute DNS de sous-domaines).',
  steps: [
    { scannerName: 'amass', args: 'enum -passive -d {{target}}' },
    { scannerName: 'dnsrecon', args: '-d {{target}}' },
    { scannerName: 'fierce', args: '--domain {{target}}' },
  ],
};
