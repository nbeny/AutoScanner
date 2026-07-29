import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SamlReconInput = z.object({
  metadataUrl: z.string().url().optional(),
});
export type SamlReconInputType = z.infer<typeof SamlReconInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const SamlReconScanner: ScannerDefinition<SamlReconInputType> = {
  name: 'saml-recon',
  displayName: 'SAML recon',
  category: [ScannerCategory.API_SECURITY],
  description:
    'Discovers SAML SP/IdP metadata at common endpoints and flags weak-signature signals ' +
    '(e.g. SHA-1 signing, unsigned metadata).',
  inputSchema: SamlReconInput,
  docker: {
    image: 'autoscanner/saml-recon:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    const arg = shEscape(input.metadataUrl ?? target);
    return { cmd: ['sh', '-lc', `saml-probe ${arg} > /out/result.json`] };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'saml-recon-json' }],
  produces: ['Finding'],
};
