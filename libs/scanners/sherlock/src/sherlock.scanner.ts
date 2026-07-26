import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

/** Usernames: alphanumeric + . _ - only (neutralises shell metachars). */
const SEED_RE = /^[A-Za-z0-9._-]{1,64}$/;

const SherlockInput = z.object({
  usernames: z.array(z.string().regex(SEED_RE)).default([]),
  timeoutSec: z.number().int().min(10).max(120).default(30),
});
export type SherlockInputType = z.infer<typeof SherlockInput>;

export const SherlockScanner: ScannerDefinition<SherlockInputType> = {
  name: 'sherlock',
  displayName: 'Sherlock (username OSINT)',
  category: [ScannerCategory.IDENTITY_OSINT, ScannerCategory.OSINT],
  description:
    'Hunts a username across 400+ social networks. Key-free OSINT that complements maigret ' +
    '(different site list / probe logic). Seeds are supplied via the `usernames` input ' +
    '(falls back to the engagement target).',
  inputSchema: SherlockInput,
  docker: {
    image: 'autoscanner/sherlock:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, _ctx) {
    const seeds = input.usernames.length > 0 ? input.usernames : [target];
    // sherlock writes a `<user>.txt` report to CWD; point CWD at the writable
    // tmpfs (/tmp) so the readonly rootfs is respected.
    const runs = seeds
      .map(
        (u) =>
          `echo '## SEED ${u}'; sherlock '${u}' --print-found --no-color ` +
          `--timeout ${input.timeoutSec} 2>/dev/null || true`,
      )
      .join('; ');
    return { cmd: ['sh', '-lc', `cd /tmp && { ${runs}; }`] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'sherlock-text' }],
  produces: ['Identity'],
};
