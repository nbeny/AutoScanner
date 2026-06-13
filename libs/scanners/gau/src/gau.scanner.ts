import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GauInput = z.object({ subs: z.boolean().default(true) });
export type GauInputType = z.infer<typeof GauInput>;

export const GauScanner: ScannerDefinition<GauInputType> = {
  name: 'gau',
  displayName: 'gau',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'Fetch known URLs from web archives (getallurls). Custom-built image.',
  inputSchema: GauInput,
  docker: {
    image: 'autoscanner/gau:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const args = input.subs ? ['--subs', target] : [target];
    return { cmd: ['gau', ...args] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'urllines-text' }],
  produces: ['Endpoint'],
};
