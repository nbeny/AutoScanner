import type { TemplateDefinition } from '../types';

/**
 * Active reconnaissance chain (Phase 2):
 *
 * - `subfinder` énumère les sous-domaines du `target` initial.
 * - `dnsx` résout les `subdomains` en enregistrements DNS (alimente le
 *   contexte `ipAddresses` via le parser).
 * - `httpx` empreinte HTTP les `subdomains` (tech detection activée).
 * - `naabu` scanne les ports du contexte `ipAddresses` (top-100 par défaut).
 *
 * Diffère de `recon-passive` par la résolution DNS active (dnsx) et le port
 * scan TCP (naabu) — donc considéré « active recon » au sens scope OPSEC.
 */
export const ReconActive: TemplateDefinition = {
  name: 'recon-active',
  displayName: 'Active Recon',
  description: 'Subdomain enum, DNS resolution, HTTP fingerprint, port scan.',
  steps: [
    {
      scannerName: 'subfinder',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'alterx',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'dnsx',
      inputs: {},
      target: { kind: 'context', path: 'subdomains' },
    },
    {
      scannerName: 'httpx',
      inputs: {
        techDetect: { kind: 'static', value: true },
      },
      target: { kind: 'context', path: 'subdomains' },
    },
    {
      scannerName: 'naabu',
      inputs: {
        ports: { kind: 'static', value: 'top-100' },
      },
      target: { kind: 'context', path: 'ipAddresses' },
    },
    {
      scannerName: 'subzy',
      inputs: {},
      target: { kind: 'context', path: 'subdomains' },
    },
  ],
};
