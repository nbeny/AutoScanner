import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const MasscanInput = z.object({
  ports: z.string().default('1-65535'),
  rate: z.number().int().positive().default(1000),
});

export type MasscanInputType = z.infer<typeof MasscanInput>;

export const MasscanScanner: ScannerDefinition<MasscanInputType> = {
  name: 'masscan',
  displayName: 'Masscan',
  category: [ScannerCategory.PORT_SCAN, ScannerCategory.NETWORK_DISCOVERY],
  description:
    'Ultra-fast full-port scanner. Scans all 65535 ports in ~90s at 1000 pps. ' +
    'Requires NET_RAW + NET_ADMIN capabilities and host networking.',
  inputSchema: MasscanInput,
  docker: {
    image: 'autoscanner/masscan:1.0',
    network: 'host',
    capabilities: ['NET_RAW', 'NET_ADMIN'],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    return {
      cmd: ['masscan', target, '-p', input.ports, '--rate', String(input.rate), '-oJ', '-'],
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'masscan-json' }],
  produces: ['Port'],
};
