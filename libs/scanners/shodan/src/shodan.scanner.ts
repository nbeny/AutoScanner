import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

/**
 * Wraps `target` in single quotes and escapes any embedded single quotes so it
 * is safe to interpolate into a shell string.  Prevents shell injection from
 * attacker-controlled target values.
 *
 * e.g. "a.com; rm -rf /" → "'a.com; rm -rf /'"
 *      "it's" → "'it'\\''s'"
 */
function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const ShodanScanner: ScannerDefinition<Record<string, never>> = {
  name: 'shodan',
  displayName: 'Shodan',
  category: [ScannerCategory.OSINT],
  description:
    'Queries the Shodan domain API for passive DNS and host metadata. ' +
    'Requires a SHODAN_API_KEY credential injected by scan-worker.',
  inputSchema: z.object({}),
  requiresCredential: 'SHODAN',
  credentialEnvVar: 'SHODAN_API_KEY',
  docker: {
    image: 'autoscanner/shodan:1.0',
    network: 'bridge',
    capabilities: [],
    // shodan CLI writes ~/.config/shodan/api_key on init; writable home needed.
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    // The decrypted key is injected as SHODAN_API_KEY by scan-worker. Init the
    // CLI from it, then query the domain. `|| true` keeps a no-result exit 0.
    const script = `shodan init "$SHODAN_API_KEY" >/dev/null 2>&1 && shodan domain ${shellQuoteSingle(target)} || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'shodan-json' }],
  produces: ['OrgMetadata'],
};
