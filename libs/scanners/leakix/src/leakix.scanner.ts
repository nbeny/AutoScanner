import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const LeakixInput = z.object({
  query: z.string().min(1).optional(),
});
export type LeakixInputType = z.infer<typeof LeakixInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const LeakixScanner: ScannerDefinition<LeakixInputType> = {
  name: 'leakix',
  displayName: 'LeakIX',
  category: [ScannerCategory.BREACH_INTEL, ScannerCategory.OSINT],
  description:
    'Queries LeakIX for leaks / exposed services affecting a domain or host. Uses a free-tier ' +
    'LeakIX API key (managed in Settings -> API Keys).',
  inputSchema: LeakixInput,
  docker: {
    image: 'autoscanner/leakix:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    const q = shEscape(input.query ?? target);
    return { cmd: ['sh', '-lc', `leakix-probe ${q} > /out/result.json`] };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'leakix-json' }],
  produces: ['BreachExposure'],
  requiresCredential: 'LEAKIX',
  credentialEnvVar: 'LEAKIX_API_KEY',
};
