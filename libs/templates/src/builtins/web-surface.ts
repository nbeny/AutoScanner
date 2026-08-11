import type { TemplateDefinition } from '../types';

/**
 * Web surface playlist (SP3a) — HTTP fingerprint + WAF detection + Nikto
 * baseline scan against the root target host/URL. Nikto is intrusive.
 */
export const WebSurface: TemplateDefinition = {
  name: 'web-surface',
  displayName: 'Web surface',
  description:
    'Empreinte web: whatweb (technologies), wafw00f (detection WAF), nikto ' +
    '(scan de vulnerabilites serveur web).',
  scopeAcknowledgement:
    'Scan actif (nikto): assurez-vous que la cible est dans le perimetre avant de lancer.',
  steps: [
    { scannerName: 'whatweb' },
    { scannerName: 'wafw00f' },
    { scannerName: 'nikto', args: '-host {{target}}' },
  ],
};
