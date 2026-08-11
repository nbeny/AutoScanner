import type { TemplateDefinition } from '../types';

/**
 * TLS/SSL playlist (SP3a) — certificate + cipher/protocol audit against the
 * root target (default port 443).
 */
export const Tls: TemplateDefinition = {
  name: 'tls',
  displayName: 'TLS / SSL',
  description:
    'Audit TLS/SSL: sslscan (protocoles, ciphers, certificat) et sslyze ' +
    '(analyse approfondie de la configuration TLS).',
  steps: [{ scannerName: 'sslscan' }, { scannerName: 'sslyze' }],
};
