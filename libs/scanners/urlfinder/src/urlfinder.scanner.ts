import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const UrlfinderInput = z.object({
  includeSubdomains: z.boolean().default(true),
});
export type UrlfinderInputType = z.infer<typeof UrlfinderInput>;

export const UrlfinderScanner: ScannerDefinition<UrlfinderInputType> = {
  name: 'urlfinder',
  displayName: 'urlfinder (passive URL discovery)',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    "ProjectDiscovery's passive URL discovery tool, mining archives, common-crawl, otx, etc. " +
    'Optional CHAOS_API_KEY (passed via PDCP_API_KEY) is used for additional enrichment.',
  inputSchema: UrlfinderInput,
  docker: {
    image: 'autoscanner/urlfinder:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const scope = input.includeSubdomains ? '' : ' -no-subs';
    const script =
      `PDCP_API_KEY="${'${CHAOS_API_KEY:-}'}" ` +
      `urlfinder -d ${shellQuoteSingle(target)} -silent${scope} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'urllines-text' }],
  produces: ['Endpoint'],
};
