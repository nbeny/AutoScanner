import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

/** Emails or usernames: alphanumeric plus the characters valid in both (neutralises shell metachars). */
const SEED_RE = /^[A-Za-z0-9._%+@-]{1,100}$/;

const SocialscanInput = z.object({
  seeds: z.array(z.string().regex(SEED_RE)).default([]),
});
export type SocialscanInputType = z.infer<typeof SocialscanInput>;

export const SocialscanScanner: ScannerDefinition<SocialscanInputType> = {
  name: 'socialscan',
  displayName: 'socialscan (account availability)',
  category: [ScannerCategory.IDENTITY_OSINT, ScannerCategory.OSINT],
  description:
    'Checks email/username registration across platforms (Instagram, Twitter, GitHub, Tumblr, …). ' +
    'A "taken" result means an account exists for that seed. Key-free OSINT, complements holehe. ' +
    'Seeds are supplied via the `seeds` input (falls back to the engagement target).',
  inputSchema: SocialscanInput,
  docker: {
    image: 'autoscanner/socialscan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 180_000,
  },
  build(input, target, _ctx) {
    const seeds = input.seeds.length > 0 ? input.seeds : [target];
    const quoted = seeds.map((s) => `'${s}'`).join(' ');
    // socialscan writes structured results to a JSON file; emit it on stdout for
    // the parser. /tmp is a writable tmpfs under the readonly rootfs.
    const script =
      `socialscan ${quoted} --json /tmp/socialscan.json >/dev/null 2>&1 || true; ` +
      `cat /tmp/socialscan.json 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'socialscan-json' }],
  produces: ['Identity'],
};
