import type { TemplateDefinition } from '../types';

export const CloudExposure: TemplateDefinition = {
  name: 'cloud-exposure',
  displayName: 'Cloud Exposure',
  description:
    'Unauthenticated public cloud exposure recon: bucket permission checks (s3scanner) and ' +
    'multi-cloud public-resource brute-forcing (cloudbrute). No credentials required. ' +
    'Set the engagement target to the org keyword/domain.',
  steps: [
    { scannerName: 's3scanner', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'cloudbrute', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
