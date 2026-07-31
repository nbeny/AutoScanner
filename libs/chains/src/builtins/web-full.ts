import type { ChainDefinition } from '../types';

/**
 * Analyse web complète : fingerprint HTTP → tech → brute de chemins → vulns,
 * avec branche WordPress (wpscan). Tout est gated sur `httpDetected`. Voir spec §8.
 */
export const WebFullChain: ChainDefinition = {
  name: 'web-full',
  displayName: 'Web Full',
  description: 'Analyse web complète : fingerprint, contenu, vulnérabilités, branche WordPress.',
  version: '1.0.0',
  whenToUse: 'Quand une cible possède des services HTTP détectés.',
  produces: ['technologies', 'endpoints', 'findings', 'vulnerabilities'],
  scopeAcknowledgement:
    'gobuster / nuclei / wpscan sont actifs : ne les exécuter que sur des cibles autorisées.',
  steps: [
    {
      id: 'httpx',
      scannerName: 'httpx',
      target: { from: 'target' },
      inputs: { techDetect: { kind: 'static', value: true } },
    },
    {
      id: 'webanalyze',
      scannerName: 'webanalyze',
      target: { from: 'subdomains', filter: [{ pred: 'statusIn', codes: [200, 301, 302] }] },
      when: [{ pred: 'httpDetected' }],
    },
    {
      id: 'gobuster',
      scannerName: 'gobuster',
      target: { from: 'urls', filter: [{ pred: 'statusIn', codes: [200, 301, 302] }] },
      when: [{ pred: 'httpDetected' }],
    },
    {
      id: 'nuclei',
      scannerName: 'nuclei',
      target: { from: 'urls' },
      when: [{ pred: 'httpDetected' }],
    },
    {
      id: 'wpscan',
      scannerName: 'wpscan',
      target: { from: 'urls' },
      when: [{ pred: 'techPresent', name: 'wordpress' }],
    },
  ],
};
