import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const ChaosInput = z.object({
  includeRaw: z.boolean().default(false),
});
export type ChaosInputType = z.infer<typeof ChaosInput>;

export const ChaosScanner: ScannerDefinition<ChaosInputType> = {
  name: 'chaos',
  displayName: 'Chaos (ProjectDiscovery subdomain dataset)',
  category: [ScannerCategory.OSINT, ScannerCategory.SUBDOMAIN_ENUM],
  description:
    "Queries ProjectDiscovery's Chaos subdomain dataset for a domain. " +
    'Requires a CHAOS_API_KEY credential injected by scan-worker. Zero-contact, passive.',
  inputSchema: ChaosInput,
  requiresCredential: 'CHAOS',
  credentialEnvVar: 'CHAOS_API_KEY',
  docker: {
    image: 'autoscanner/chaos:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    // PDCP_API_KEY is the canonical env name read by every projectdiscovery
    // tool; we mirror CHAOS_API_KEY into it so chaos picks it up natively.
    const script = `PDCP_API_KEY="$CHAOS_API_KEY" chaos -d ${shellQuoteSingle(target)} -silent -json 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'chaos-json' }],
  produces: ['Asset'],
};
