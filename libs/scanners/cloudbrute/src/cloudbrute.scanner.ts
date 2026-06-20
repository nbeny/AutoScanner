import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const CloudbruteInput = z.object({
  /** Permutation wordlist path inside the image. */
  wordlist: z.string().default('/etc/cloudbrute/wordlist.txt'),
});

export type CloudbruteInputType = z.infer<typeof CloudbruteInput>;

export const CloudbruteScanner: ScannerDefinition<CloudbruteInputType> = {
  name: 'cloudbrute',
  displayName: 'CloudBrute (resource brute)',
  category: [ScannerCategory.CLOUD],
  description:
    'Unauthenticated multi-cloud public-resource brute-forcing (CloudBrute) from the target keyword ' +
    'across AWS/Azure/GCP. Custom-built image with a bundled wordlist + provider config.',
  inputSchema: CloudbruteInput,
  docker: {
    image: 'autoscanner/cloudbrute:1.0',
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
        'cloudbrute',
        '-d',
        target,
        '-k',
        target,
        '-w',
        input.wordlist,
        '-c',
        '/etc/cloudbrute/config.yaml',
        '-t',
        '10',
        '-o',
        '/dev/stdout',
      ],
    };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'cloudbrute-text' }],
  produces: ['Finding'],
};
