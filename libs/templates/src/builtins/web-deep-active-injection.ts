import type { TemplateDefinition } from '../types';

/**
 * Deep active-injection pipeline (SP2 of the active-injection initiative).
 *
 * Chains discovery into intensive active fuzzing:
 * - `subfinder` -> sous-domaines.
 * - `httpx`     -> repère les hôtes vivants (alimente le contexte `urls`).
 * - `katana`    -> crawl des hôtes vivants -> `endpoints` (URLs complètes avec
 *                  chemins et paramètres, persistées via EndpointPersister).
 * - `arjun`     -> découverte de paramètres cachés sur les endpoints.
 * - `web-dast`  -> fuzzing nuclei DAST (SSRF/LFI/XXE/open-redirect) par endpoint.
 * - `sqli-scan` -> sqlmap par endpoint.
 * - `ssti-scan` -> SSTImap par endpoint.
 * - `xss-scan`  -> XSS par endpoint.
 * - `cmdi-scan` -> commix (command injection) par endpoint.
 *
 * Les scanners d'injection consomment le contexte `endpoints` : chaque URL
 * découverte devient une cible distincte (fan-out). Le D3 fallback du
 * ContextBuilder couvre la course parser-worker (endpoints pas encore
 * persistés) en retombant sur la cible racine.
 */
export const WebDeepActiveInjection: TemplateDefinition = {
  name: 'web-deep-active-injection',
  displayName: 'Web Deep — Active Injection',
  description:
    'Crawl then actively fuzz every discovered endpoint for injection: subfinder -> httpx -> ' +
    'katana -> arjun -> web-dast (SSRF/LFI/XXE/open-redirect) + sqli + ssti + xss + cmdi.',
  steps: [
    {
      scannerName: 'subfinder',
      inputs: {},
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
    {
      scannerName: 'katana',
      inputs: {},
      target: { kind: 'context', path: 'urls' },
    },
    {
      scannerName: 'arjun',
      inputs: {},
      target: { kind: 'context', path: 'endpoints' },
    },
    {
      scannerName: 'web-dast',
      inputs: {},
      target: { kind: 'context', path: 'endpoints' },
    },
    {
      scannerName: 'sqli-scan',
      inputs: {},
      target: { kind: 'context', path: 'endpoints' },
    },
    {
      scannerName: 'ssti-scan',
      inputs: {},
      target: { kind: 'context', path: 'endpoints' },
    },
    {
      scannerName: 'xss-scan',
      inputs: {},
      target: { kind: 'context', path: 'endpoints' },
    },
    {
      scannerName: 'cmdi-scan',
      inputs: {},
      target: { kind: 'context', path: 'endpoints' },
    },
  ],
};
