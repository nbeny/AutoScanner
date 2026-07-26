import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

/** Phone numbers: digits plus the usual formatting glyphs only (neutralises shell metachars). */
const NUMBER_RE = /^[+0-9 ()\-.]{6,20}$/;

const PhoneinfogaInput = z.object({
  numbers: z.array(z.string().regex(NUMBER_RE)).default([]),
});
export type PhoneinfogaInputType = z.infer<typeof PhoneinfogaInput>;

export const PhoneinfogaScanner: ScannerDefinition<PhoneinfogaInputType> = {
  name: 'phoneinfoga',
  displayName: 'Phone number OSINT (phoneinfoga)',
  category: [ScannerCategory.OSINT],
  description:
    'Profiles phone numbers (country, carrier, line type, format) with phoneinfoga. ' +
    'Key-free: only the local libphonenumber scanner runs (numverify/Google CSE are skipped without keys). ' +
    'Seeds are supplied via the `numbers` input (falls back to the engagement target).',
  inputSchema: PhoneinfogaInput,
  docker: {
    image: 'autoscanner/phoneinfoga:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(input, target, _ctx) {
    const seeds = input.numbers.length > 0 ? input.numbers : [target];
    const runs = seeds
      .map(
        (num) =>
          `echo '## SEED ${num}'; phoneinfoga scan -n '${num}' --no-color 2>/dev/null || true`,
      )
      .join('; ');
    return { cmd: ['sh', '-lc', runs] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'phoneinfoga-text' }],
  produces: ['Finding', 'OrgMetadata'],
};
