import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const Method = z.enum(['std', 'axfr', 'brt', 'srv', 'rvl']);

const DnsreconInput = z.object({
  domain: z.string().min(1).optional(),
  methods: z.array(Method).default(['std', 'axfr', 'srv']),
  wordlist: z.string().optional(),
  nameservers: z.array(z.string().min(1)).default([]),
});

export type DnsreconInputType = z.infer<typeof DnsreconInput>;

export const DnsreconScanner: ScannerDefinition<DnsreconInputType> = {
  name: 'dnsrecon',
  displayName: 'dnsrecon',
  category: [ScannerCategory.DNS, ScannerCategory.SUBDOMAIN_ENUM],
  description:
    'Multi-method DNS enumeration (std/axfr/srv/brt/rvl). Default excludes brt; ' +
    'operator must explicitly tick it. AXFR success emits a HIGH finding.',
  inputSchema: DnsreconInput,
  docker: {
    image: 'autoscanner/dnsrecon:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 1_200_000,
  },
  build(input, target) {
    const domain = input.domain ?? target;
    const cmd = ['dnsrecon', '-d', domain, '-t', input.methods.join(','), '-j', '/out/result.json'];
    if (input.methods.includes('brt')) {
      cmd.push('-D', input.wordlist ?? '/opt/dnsrecon/brute.txt');
    }
    if (input.nameservers.length > 0) {
      cmd.push('-n', input.nameservers.join(','));
    }
    return { cmd };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'dnsrecon-json' }],
  produces: ['Asset', 'Finding'],
};
