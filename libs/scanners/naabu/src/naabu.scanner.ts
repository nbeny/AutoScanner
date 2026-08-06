import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const NaabuInput = z.object({
  // Accept any naabu-compatible port spec (e.g. 'top-100', '1-1000', '80,443,8080').
  // Over-constraining to a literal union here would break recon-active templates.
  ports: z
    .string()
    .default('top-100')
    .describe('Ports to scan (e.g. "top-100", "1-1000", "80,443,8080").'),
  rate: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(1000)
    .describe('Scan rate in packets per second.'),
});

export type NaabuInputType = z.infer<typeof NaabuInput>;

export const NaabuScanner: ScannerDefinition<NaabuInputType> = {
  name: 'naabu',
  displayName: 'naabu',
  category: [ScannerCategory.PORT_SCAN, ScannerCategory.NETWORK_DISCOVERY],
  description: 'Fast SYN/CONNECT port scanner (ProjectDiscovery).',
  inputSchema: NaabuInput,
  docker: {
    image: 'projectdiscovery/naabu:v2.6.1',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    return {
      cmd: ['naabu', '-silent', '-json', '-p', input.ports, '-rate', String(input.rate)],
      stdin: target,
    };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'naabu-json' }],
  produces: ['Asset', 'IpAddress', 'Port'],
};
