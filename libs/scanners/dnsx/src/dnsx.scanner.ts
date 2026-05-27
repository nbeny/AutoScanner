import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const DnsxInput = z.object({
  recordTypes: z.array(z.enum(['A', 'AAAA', 'CNAME', 'MX'])).default(['A', 'AAAA', 'CNAME', 'MX']),
});

export type DnsxInputType = z.infer<typeof DnsxInput>;

export const DnsxScanner: ScannerDefinition<DnsxInputType> = {
  name: 'dnsx',
  displayName: 'dnsx',
  category: [ScannerCategory.DNS, ScannerCategory.PASSIVE_RECON],
  description: 'Fast DNS resolver and enumeration (ProjectDiscovery).',
  inputSchema: DnsxInput,
  docker: {
    image: 'projectdiscovery/dnsx:latest',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(_input, target) {
    return {
      cmd: ['dnsx', '-silent', '-json', '-resp', '-a', '-aaaa', '-cname', '-mx'],
      stdin: target,
    };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'dnsx-json' }],
  produces: ['Asset', 'IpAddress', 'DnsRecord'],
};
