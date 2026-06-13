import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const FfufInput = z.object({
  wordlist: z.string().default('/etc/ffuf/content.txt'),
  matchCodes: z.string().default('200,204,301,302,307,401,403'),
});
export type FfufInputType = z.infer<typeof FfufInput>;

export const FfufScanner: ScannerDefinition<FfufInputType> = {
  name: 'ffuf',
  displayName: 'ffuf',
  category: [ScannerCategory.WEB_ENUM],
  description:
    'Directory/content fuzzing (ffuf) with a small bundled wordlist. Custom-built image.',
  inputSchema: FfufInput,
  docker: {
    image: 'autoscanner/ffuf:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    return {
      cmd: [
        'ffuf',
        '-u',
        `https://${target}/FUZZ`,
        '-w',
        input.wordlist,
        '-mc',
        input.matchCodes,
        '-of',
        'json',
        '-o',
        '/dev/stdout',
        '-s',
      ],
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'ffuf-json' }],
  produces: ['Endpoint'],
};
