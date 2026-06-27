import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

const FofaInput = z.object({
  query: z.string().min(1),
  size: z.number().int().min(1).max(10_000).default(100),
});
export type FofaInputType = z.infer<typeof FofaInput>;

export const FofaScanner: ScannerDefinition<FofaInputType> = {
  name: 'fofa',
  displayName: 'FOFA (APAC search engine)',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    'Queries the FOFA search engine for hosts matching a dork. ' +
    'Requires a FOFA credential (pasted as "email:key") via the credential store.',
  inputSchema: FofaInput,
  requiresCredential: 'FOFA',
  credentialEnvVar: 'FOFA_CREDENTIAL',
  docker: {
    image: 'autoscanner/fofa:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, _target) {
    // The encrypted slot stores "email:key" verbatim. We split at runtime
    // inside the container so the secrets never appear in argv (ps).
    const q = shellQuoteSingle(input.query);
    const script =
      `FOFA_EMAIL="$(printf %s "$FOFA_CREDENTIAL" | cut -d: -f1)" ` +
      `FOFA_KEY="$(printf %s "$FOFA_CREDENTIAL" | cut -d: -f2-)" ` +
      `FOFA_QUERY=${q} ` +
      `FOFA_SIZE=${input.size} ` +
      `python /usr/local/bin/fofa-client.py 2>/dev/null || echo '[]'`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'fofa-json' }],
  produces: ['Asset', 'Technology'],
};
