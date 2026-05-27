import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SubfinderInput = z.object({
  sources: z.array(z.string()).default([]),
  recursive: z.boolean().default(false),
  timeout: z.number().int().min(1).max(600).default(60),
});

export type SubfinderInputType = z.infer<typeof SubfinderInput>;

export const SubfinderScanner: ScannerDefinition<SubfinderInputType> = {
  name: 'subfinder',
  displayName: 'Subfinder',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'Passive subdomain enumeration (ProjectDiscovery).',
  inputSchema: SubfinderInput,
  docker: {
    image: 'projectdiscovery/subfinder:latest',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const args = ['-silent', '-oJ', '-d', target, '-timeout', String(input.timeout)];
    if (input.recursive) args.push('-recursive');
    if (input.sources.length) args.push('-sources', input.sources.join(','));
    return { cmd: ['subfinder', ...args] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'subfinder-json' }],
  produces: ['Asset', 'Subdomain'],
};
