import type { TemplateDefinition } from '../types';

/**
 * Étape 1 de Phase 2: chaîne de reconnaissance passive linéaire.
 *
 * - `subfinder` énumère les sous-domaines du `target` initial.
 * - `httpx` empreinte HTTP les `subdomains` produits par le step précédent
 *   (tech detection activée).
 */
export const ReconPassive: TemplateDefinition = {
  name: 'recon-passive',
  displayName: 'Passive Recon',
  description: 'Subdomain enumeration (subfinder) + HTTP fingerprinting (httpx).',
  steps: [
    {
      scannerName: 'subfinder',
      inputs: {
        sources: { kind: 'static', value: [] },
        recursive: { kind: 'static', value: false },
      },
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'httpx',
      inputs: {
        techDetect: { kind: 'static', value: true },
      },
      target: { kind: 'context', path: 'subdomains' },
    },
  ],
};
