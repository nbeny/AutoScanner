import type { TemplateDefinition } from '../types';

/**
 * Quick web triage (Phase 2):
 *
 * - `httpx` empreinte HTTP la cible racine (`target`) — tech detection activée.
 * - `naabu` scanne les ports du contexte `ipAddresses` (top-100).
 *
 * **Note** — `web-quick` saute volontairement subfinder/dnsx: il assume une
 * cible de type host ou URL pour laquelle on veut un check rapide. Si le
 * contexte `ipAddresses` est vide au moment du step naabu (ce qui est le cas
 * par défaut sur un engagement fraîchement créé sans dnsx préalable), le
 * `ContextBuilder` du orchestrator-worker applique son fallback documenté
 * (D3): la racine `target` est utilisée à la place. Donc naabu scannera la
 * cible racine résolue par sa propre logique réseau plutôt qu'un IP litéral.
 *
 * Pour un scénario où l'IP doit déjà être connue, exécuter d'abord
 * `recon-active` ou `web-deep` sur l'engagement.
 */
export const WebQuick: TemplateDefinition = {
  name: 'web-quick',
  displayName: 'Web Quick',
  description: 'HTTP fingerprint of the target host + top-100 port scan.',
  steps: [
    {
      scannerName: 'httpx',
      inputs: {
        techDetect: { kind: 'static', value: true },
      },
      target: { kind: 'context', path: 'target' },
    },
    {
      scannerName: 'naabu',
      inputs: {
        ports: { kind: 'static', value: 'top-100' },
      },
      target: { kind: 'context', path: 'ipAddresses' },
    },
  ],
};
