import type { TemplateDefinition } from '../types';

/**
 * SNMP playlist (SP3a) — community-string brute (onesixtyone) + SNMP walk
 * (snmp-check) against the root target host. Active enumeration.
 */
export const Snmp: TemplateDefinition = {
  name: 'snmp',
  displayName: 'SNMP',
  description:
    'Enumeration SNMP: onesixtyone (brute de community strings) et snmp-check ' +
    '(inventaire SNMP de la cible).',
  scopeAcknowledgement:
    'Scan actif (SNMP): assurez-vous que la cible est dans le perimetre avant de lancer.',
  steps: [{ scannerName: 'onesixtyone' }, { scannerName: 'snmp-check' }],
};
