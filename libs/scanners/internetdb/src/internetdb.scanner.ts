import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

/** IPv4/IPv6 literal characters only (neutralises shell metachars). */
const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

const InternetdbInput = z.object({
  ips: z.array(z.string().regex(IP_RE)).default([]),
});
export type InternetdbInputType = z.infer<typeof InternetdbInput>;

export const InternetdbScanner: ScannerDefinition<InternetdbInputType> = {
  name: 'internetdb',
  displayName: 'Shodan InternetDB (passive IP enrichment)',
  category: [ScannerCategory.PASSIVE_RECON, ScannerCategory.OSINT],
  description:
    "Passively enriches IPs via Shodan's free InternetDB API (no API key): open ports, CPEs, " +
    'hostnames, tags and known CVEs — without touching the target. Seeds are supplied via the ' +
    '`ips` input (falls back to the engagement target).',
  inputSchema: InternetdbInput,
  docker: {
    image: 'autoscanner/internetdb:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(input, target, _ctx) {
    const seeds = input.ips.length > 0 ? input.ips : [target];
    // One JSON document per line (JSONL). InternetDB echoes the queried IP in the
    // `ip` field, so no extra wrapping is needed.
    const runs = seeds
      .map((ip) => `curl -s --max-time 15 'https://internetdb.shodan.io/${ip}' 2>/dev/null; echo`)
      .join('; ');
    return { cmd: ['sh', '-lc', runs] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'internetdb-json' }],
  produces: ['Port', 'Service', 'Finding'],
};
