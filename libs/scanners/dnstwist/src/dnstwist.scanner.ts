import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const DnstwistInput = z.object({
  registeredOnly: z.boolean().default(true),
  mxCheck: z.boolean().default(false),
});
export type DnstwistInputType = z.infer<typeof DnstwistInput>;

export const DnstwistScanner: ScannerDefinition<DnstwistInputType> = {
  name: 'dnstwist',
  displayName: 'dnstwist (typosquat / lookalike domains)',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    'Generates lookalike/typosquat permutations of a domain and checks which are registered ' +
    '(DNS A/MX). Surfaces brand-impersonation and phishing-infrastructure risk. Key-free.',
  inputSchema: DnstwistInput,
  docker: {
    image: 'autoscanner/dnstwist:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, _ctx) {
    const registered = input.registeredOnly ? ' --registered' : '';
    const mx = input.mxCheck ? ' --mxcheck' : '';
    const script = `dnstwist --format json${registered}${mx} '${target}' || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'dnstwist-json' }],
  produces: ['Asset', 'Finding'],
};
