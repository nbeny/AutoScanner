import type { TemplateDefinition } from '../types';

/**
 * Web content playlist (SP3a) — directory brute-force + WordPress audit against
 * the root target. Both steps are active/intrusive.
 */
export const WebContenu: TemplateDefinition = {
  name: 'web-contenu',
  displayName: 'Web contenu',
  description:
    'Decouverte de contenu web: dirb (brute-force de repertoires), wpscan ' + '(audit WordPress).',
  scopeAcknowledgement:
    'Scan actif (dirb/wpscan): assurez-vous que la cible est dans le perimetre avant de lancer.',
  steps: [
    { scannerName: 'dirb', args: 'http://{{target}}' },
    { scannerName: 'wpscan', args: '--url http://{{target}}' },
  ],
};
