import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const HttpxInput = z.object({
  ports: z.array(z.number().int()).default([80, 443]),
  followRedirects: z.boolean().default(true),
  techDetect: z.boolean().default(true),
  statusCode: z.boolean().default(true),
  title: z.boolean().default(true),
  timeout: z.number().int().min(1).max(60).default(10),
});

export type HttpxInputType = z.infer<typeof HttpxInput>;

export const HttpxScanner: ScannerDefinition<HttpxInputType> = {
  name: 'httpx',
  displayName: 'httpx',
  category: [ScannerCategory.WEB_FINGERPRINT, ScannerCategory.PASSIVE_RECON],
  description: 'Fast HTTP probe and fingerprinter (ProjectDiscovery).',
  inputSchema: HttpxInput,
  docker: {
    image: 'projectdiscovery/httpx:v1.9.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const args = [
      '-silent',
      '-json',
      '-nc',
      '-no-fallback',
      '-timeout',
      String(input.timeout),
      '-p',
      input.ports.join(','),
    ];
    if (input.techDetect) args.push('-tech-detect');
    if (input.statusCode) args.push('-sc');
    if (input.title) args.push('-title');
    if (input.followRedirects) args.push('-fr');
    return { cmd: ['httpx', ...args], stdin: target };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'httpx-json' }],
  produces: ['Asset', 'Subdomain', 'Technology'],
};
