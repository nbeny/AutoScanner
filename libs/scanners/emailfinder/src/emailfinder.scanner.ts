import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const ENGINE_RE = /^[a-z0-9]{2,16}$/;

const EmailfinderInput = z.object({
  engines: z.array(z.string().regex(ENGINE_RE)).default(['google', 'bing', 'baidu']),
});
export type EmailfinderInputType = z.infer<typeof EmailfinderInput>;

export const EmailfinderScanner: ScannerDefinition<EmailfinderInputType> = {
  name: 'emailfinder',
  displayName: 'emailfinder (search-engine email harvest)',
  category: [ScannerCategory.OSINT, ScannerCategory.IDENTITY_OSINT],
  description:
    'Harvests email addresses from public search engines (Josue87/EmailFinder). ' +
    'No API keys required for default engines.',
  inputSchema: EmailfinderInput,
  docker: {
    image: 'autoscanner/emailfinder:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    return {
      cmd: [
        'python',
        '/opt/emailfinder/emailfinder.py',
        '-d',
        target,
        '-e',
        input.engines.join(','),
        '-j',
      ],
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'emailfinder-json' }],
  produces: ['Email'],
};
