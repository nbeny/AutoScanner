import type { TemplateDefinition } from '../types';

/**
 * Phase 12 — OSINT identité. maigret (username → comptes) + holehe (email →
 * comptes). Lancé par l'opérateur avec des graines explicites (usernames /
 * emails) passées en inputs de chaque étape.
 */
export const IdentityOsint: TemplateDefinition = {
  name: 'identity-osint',
  displayName: 'Identity OSINT (username & email)',
  description:
    'Account-presence OSINT: maigret enumerates usernames across 3000+ sites, holehe checks ' +
    'which services an email is registered on. Supply usernames/emails as step inputs.',
  steps: [
    { scannerName: 'maigret', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'holehe', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
