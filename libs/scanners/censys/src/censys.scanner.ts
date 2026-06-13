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

export const CensysScanner: ScannerDefinition<Record<string, never>> = {
  name: 'censys',
  displayName: 'Censys',
  category: [ScannerCategory.OSINT],
  description:
    'Queries the Censys hosts search API for passive host and service metadata. ' +
    'Requires a CENSYS_API_CRED credential (colon-joined "<id>:<secret>") injected by scan-worker.',
  inputSchema: z.object({}),
  requiresCredential: 'CENSYS',
  credentialEnvVar: 'CENSYS_API_CRED',
  docker: {
    image: 'autoscanner/censys:1.0',
    network: 'bridge',
    capabilities: [],
    // censys CLI may write config to the home directory; writable home needed.
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    // CENSYS_API_CRED is injected as "<id>:<secret>" by scan-worker. Split it
    // into the env vars the censys CLI reads, then search hosts for the domain.
    const script =
      'export CENSYS_API_ID="${CENSYS_API_CRED%%:*}" CENSYS_API_SECRET="${CENSYS_API_CRED#*:}"; ' +
      `censys search ${shellQuoteSingle(target)} --index-type hosts || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'censys-json' }],
  produces: ['OrgMetadata'],
};
