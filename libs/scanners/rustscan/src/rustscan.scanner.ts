import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const RustscanInput = z.object({
  ports: z.string().default('1-65535'),
  batchSize: z.number().int().positive().default(4500),
  ulimit: z.number().int().positive().default(5000),
});

export type RustscanInputType = z.infer<typeof RustscanInput>;

export const RustscanScanner: ScannerDefinition<RustscanInputType> = {
  name: 'rustscan',
  displayName: 'RustScan',
  category: [ScannerCategory.PORT_SCAN, ScannerCategory.NETWORK_DISCOVERY],
  description:
    'Accelerated TCP port discovery (rustscan greppable). Bridged network, no raw sockets. ' +
    'Pipeline composition with nmap -sV is wired at the template layer.',
  inputSchema: RustscanInput,
  docker: {
    image: 'autoscanner/rustscan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target) {
    return {
      cmd: [
        'rustscan',
        '-a',
        target,
        '-r',
        input.ports,
        '-b',
        String(input.batchSize),
        '-u',
        String(input.ulimit),
        '--no-banner',
        '--greppable',
      ],
    };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'rustscan-greppable' }],
  produces: ['Asset', 'Port'],
};
