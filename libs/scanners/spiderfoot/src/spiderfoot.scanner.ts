import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

/**
 * Curated set of passive, key-free SpiderFoot modules: DNS resolution, cert
 * transparency, whois, TLS cert inspection, email scraping and light spidering.
 * None require an API key, so the scanner runs fully unauthenticated.
 */
const KEY_FREE_MODULES = 'sfp_dnsresolve,sfp_crt,sfp_whois,sfp_sslcert,sfp_email,sfp_spider';

const SpiderfootInput = z.object({
  /** Comma-separated SpiderFoot module ids to run. */
  modules: z.string().default(KEY_FREE_MODULES),
});
export type SpiderfootInputType = z.infer<typeof SpiderfootInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const SpiderfootScanner: ScannerDefinition<SpiderfootInputType> = {
  name: 'spiderfoot',
  displayName: 'SpiderFoot (OSINT aggregator)',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    'Runs SpiderFoot as a one-shot CLI scan over a curated set of passive, key-free ' +
    'OSINT modules and emits the event stream as JSON. No persistent service / web UI.',
  inputSchema: SpiderfootInput,
  docker: {
    image: 'autoscanner/spiderfoot:1.0',
    network: 'bridge',
    capabilities: [],
    // SpiderFoot writes a sqlite scan DB under $HOME; needs a writable rootfs.
    readonlyRootfs: false,
    memoryLimitMb: 1024,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target) {
    // One-shot CLI scan (`-s`), restricted module set (`-m`), JSON to stdout
    // (`-o json`), quiet (`-q`). `|| true` keeps exit 0 — stdout is the signal.
    const script =
      `cd /home/scanner/spiderfoot && ` +
      `python3 ./sf.py -s ${shellQuoteSingle(target)} -m ${input.modules} -o json -q || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'spiderfoot-json' }],
  produces: ['Finding', 'Asset', 'Email', 'IpAddress'],
};
