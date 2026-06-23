import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

/** Pseudos : alphanumérique + . _ - uniquement (neutralise toute métacaractère shell). */
const SEED_RE = /^[A-Za-z0-9._-]{1,64}$/;

const MaigretInput = z.object({
  usernames: z.array(z.string().regex(SEED_RE)).default([]),
  topSites: z.number().int().min(50).max(3000).default(500),
  timeoutSec: z.number().int().min(10).max(300).default(60),
});
export type MaigretInputType = z.infer<typeof MaigretInput>;

export const MaigretScanner: ScannerDefinition<MaigretInputType> = {
  name: 'maigret',
  displayName: 'Maigret (username OSINT)',
  category: [ScannerCategory.IDENTITY_OSINT, ScannerCategory.OSINT],
  description:
    'Enumerates account presence for usernames across 3000+ sites. Key-free OSINT. ' +
    'Seeds are supplied explicitly via the `usernames` input (falls back to the engagement target).',
  inputSchema: MaigretInput,
  docker: {
    image: 'autoscanner/maigret:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, _ctx) {
    const seeds = input.usernames.length > 0 ? input.usernames : [target];
    const runs = seeds
      .map(
        (u) =>
          `echo '## SEED ${u}'; maigret '${u}' --print-found --no-color --no-progressbar ` +
          `--top-sites ${input.topSites} --timeout ${input.timeoutSec} 2>/dev/null || true`,
      )
      .join('; ');
    return { cmd: ['sh', '-lc', runs] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'maigret-text' }],
  produces: ['Identity'],
};
