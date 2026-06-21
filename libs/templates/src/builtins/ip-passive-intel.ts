import type { TemplateDefinition } from '../types';

export const IpPassiveIntel: TemplateDefinition = {
  name: 'ip-passive-intel',
  displayName: 'IP Passive Intel',
  description:
    'Passive IP reputation lookup without touching the target. ' +
    'Checks AbuseIPDB (free key required) and GreyNoise (community, no key). ' +
    'Set the engagement target to a single IPv4 address.',
  steps: [
    { scannerName: 'abuseipdb', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'greynoise', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
