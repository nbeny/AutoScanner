import type { TemplateDefinition } from '../types';

/**
 * Network playlist (SP3a) — service/version scan (nmap) + full-range fast port
 * sweep (masscan) against the root target. Both are active; masscan's aggressive
 * full-range sweep is gated behind the `active-recon-host-net` capability.
 */
export const Reseau: TemplateDefinition = {
  name: 'reseau',
  displayName: 'Reseau',
  description:
    'Scan reseau: nmap (detection de services et versions, -sV -Pn) puis masscan ' +
    '(balayage rapide de tous les ports).',
  scopeAcknowledgement:
    'Scan actif (nmap/masscan): assurez-vous que la cible est dans le perimetre avant de lancer.',
  steps: [
    { scannerName: 'nmap', args: '-sV -Pn' },
    {
      scannerName: 'masscan',
      args: '-p1-65535 --rate 1000',
      requiresCapability: 'active-recon-host-net',
    },
  ],
};
