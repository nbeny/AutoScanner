import type { TemplateDefinition } from '../types';

/**
 * Full web pipeline (Phase 2):
 *
 * - `subfinder` -> sous-domaines.
 * - `dnsx`      -> résolution DNS (alimente `ipAddresses`).
 * - `httpx`     -> HTTP fingerprint + tech detect sur les sous-domaines.
 * - `naabu`     -> port scan top-100 sur les IPs résolues.
 * - `nuclei`    -> templates vulnérabilités sur le contexte `urls` (hosts
 *                  ayant un httpStatus probé par httpx).
 *
 * Inputs nuclei laissés vides (defaults: pas de filtre severity/tags/templates
 * — exécute toute la base par défaut). À durcir dans une phase ultérieure si
 * besoin de policy par engagement.
 */
export const WebDeep: TemplateDefinition = {
  name: 'web-deep',
  displayName: 'Web Deep',
  description:
    'Full chain: subdomain enum, DNS resolution, HTTP fingerprint, port scan, vuln templates.',
  steps: [
    {
      scannerName: 'subfinder',
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
      scannerName: 'nuclei',
      inputs: {},
      target: { kind: 'context', path: 'urls' },
    },
  ],
};
