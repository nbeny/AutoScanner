import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const AlterxInput = z.object({
  /** Upper bound on generated permutations before resolution. */
  maxPermutations: z.number().int().min(100).max(100_000).default(10_000),
});
export type AlterxInputType = z.infer<typeof AlterxInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const AlterxScanner: ScannerDefinition<AlterxInputType> = {
  name: 'alterx',
  displayName: 'AlterX (subdomain permutations)',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.DNS],
  description:
    'Generates subdomain permutations from the target domain (alterx -enrich) and ' +
    'resolves them through dnsx, emitting only permutations that resolve. Active DNS.',
  inputSchema: AlterxInput,
  docker: {
    // Custom image bundles BOTH alterx and dnsx (pinned PD binaries).
    image: 'autoscanner/alterx:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const script =
      `alterx -d ${shellQuoteSingle(target)} -enrich -limit ${input.maxPermutations} -silent ` +
      `| dnsx -silent`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Subdomain', 'Asset'],
};
