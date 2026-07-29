import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const IntelxInput = z.object({
  query: z.string().min(1).optional(),
});
export type IntelxInputType = z.infer<typeof IntelxInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const IntelxScanner: ScannerDefinition<IntelxInputType> = {
  name: 'intelx',
  displayName: 'Intelligence X',
  category: [ScannerCategory.BREACH_INTEL, ScannerCategory.IDENTITY_OSINT],
  description:
    'Queries Intelligence X for leaked documents, pastes and breach records affecting an ' +
    'email/domain. Uses a free-tier Intelligence X API key (managed in Settings → API Keys).',
  inputSchema: IntelxInput,
  docker: {
    image: 'autoscanner/intelx:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    const q = shEscape(input.query ?? target);
    return { cmd: ['sh', '-lc', `intelx-probe ${q} > /out/result.json`] };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'intelx-json' }],
  produces: ['BreachExposure'],
  requiresCredential: 'INTELX',
  credentialEnvVar: 'INTELX_API_KEY',
};
