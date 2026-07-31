import type { ChainDefinition } from '../types';

/**
 * Recon IP complet : OSINT theHarvester → tag CDN → nmap uniquement les IP
 * hors-CDN (skip Cloudflare & co). Voir spec §8.
 */
export const IpReconFullChain: ChainDefinition = {
  name: 'ip-recon-full',
  displayName: 'IP Recon Full',
  description: 'OSINT des IP puis scan de ports des seules IP hors-CDN.',
  version: '1.0.0',
  whenToUse:
    "Quand on veut cartographier les IP d'une cible et scanner leurs ports sans gaspiller de scan sur les IP derrière un CDN.",
  produces: ['ipAddresses', 'ports', 'findings'],
  scopeAcknowledgement:
    "Le scan de ports (nmap) est actif : ne l'exécuter que sur des cibles autorisées.",
  steps: [
    {
      id: 'theharvester',
      scannerName: 'theharvester',
      target: { from: 'target' },
    },
    {
      id: 'cdncheck',
      scannerName: 'cdncheck',
      target: { from: 'ipAddresses' },
    },
    {
      id: 'nmap',
      scannerName: 'nmap',
      target: { from: 'ipAddresses', filter: [{ pred: 'notBehindCdn' }] },
    },
  ],
};
