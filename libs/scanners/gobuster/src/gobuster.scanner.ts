import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GobusterInput = z.object({
  wordlist: z.string().default('/etc/gobuster/content.txt'),
});
export type GobusterInputType = z.infer<typeof GobusterInput>;

export const GobusterScanner: ScannerDefinition<GobusterInputType> = {
  name: 'gobuster',
  displayName: 'gobuster',
  category: [ScannerCategory.WEB_ENUM],
  description:
    'Directory brute-forcing (gobuster) with a small bundled wordlist. Custom-built image.',
  inputSchema: GobusterInput,
  docker: {
    image: 'autoscanner/gobuster:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    return {
      cmd: [
        'gobuster',
        'dir',
        '-u',
        `https://${target}`,
        '-w',
        input.wordlist,
        '-q',
        '--no-color',
        '-o',
        '/dev/stdout',
      ],
    };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'gobuster-text' }],
  produces: ['Endpoint'],
};
