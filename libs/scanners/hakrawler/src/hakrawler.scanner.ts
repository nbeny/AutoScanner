import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const HakrawlerInput = z.object({
  depth: z.number().int().min(1).max(10).default(2),
  subdomainsInScope: z.boolean().default(true),
});
export type HakrawlerInputType = z.infer<typeof HakrawlerInput>;

export const HakrawlerScanner: ScannerDefinition<HakrawlerInputType> = {
  name: 'hakrawler',
  displayName: 'hakrawler',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.WEB_FINGERPRINT],
  description:
    'Lightweight web crawler (hakluke/hakrawler). Reads target URL on stdin, ' +
    'emits discovered URLs one per line.',
  inputSchema: HakrawlerInput,
  docker: {
    image: 'autoscanner/hakrawler:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const cmd = ['hakrawler', '-d', String(input.depth)];
    if (input.subdomainsInScope) cmd.push('-subs');
    cmd.push('-plain');
    return { cmd, stdin: `${target}\n` };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hakrawler-text' }],
  produces: ['Endpoint'],
};
