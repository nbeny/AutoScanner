import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const HoleheInput = z.object({
  emails: z.array(z.string().email()).default([]),
  onlyUsed: z.boolean().default(true),
});
export type HoleheInputType = z.infer<typeof HoleheInput>;

export const HoleheScanner: ScannerDefinition<HoleheInputType> = {
  name: 'holehe',
  displayName: 'Holehe (email account OSINT)',
  category: [ScannerCategory.IDENTITY_OSINT, ScannerCategory.OSINT],
  description:
    'Checks which of 120+ web services have an account registered for an email address. ' +
    'Key-free OSINT. Seeds are supplied via the `emails` input (falls back to the engagement target).',
  inputSchema: HoleheInput,
  docker: {
    image: 'autoscanner/holehe:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, _ctx) {
    const seeds = input.emails.length > 0 ? input.emails : [target];
    const onlyUsed = input.onlyUsed ? ' --only-used' : '';
    const runs = seeds
      .map((e) => `echo '## SEED ${e}'; holehe '${e}' --no-color${onlyUsed} 2>/dev/null || true`)
      .join('; ');
    return { cmd: ['sh', '-lc', runs] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'holehe-text' }],
  produces: ['Identity'],
};
