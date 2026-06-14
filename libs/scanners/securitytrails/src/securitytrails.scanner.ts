import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SecuritytrailsInput = z.object({});
export type SecuritytrailsInputType = z.infer<typeof SecuritytrailsInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const SecuritytrailsScanner: ScannerDefinition<SecuritytrailsInputType> = {
  name: 'securitytrails',
  displayName: 'SecurityTrails (passive DNS)',
  category: [ScannerCategory.PASSIVE_RECON, ScannerCategory.DNS],
  description:
    'Passive DNS / subdomain discovery via the SecurityTrails API. Requires a SECURITYTRAILS_API_KEY credential.',
  inputSchema: SecuritytrailsInput,
  requiresCredential: 'SECURITYTRAILS',
  credentialEnvVar: 'SECURITYTRAILS_API_KEY',
  docker: {
    image: 'autoscanner/securitytrails:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    const url = `https://api.securitytrails.com/v1/domain/${shellQuoteSingle(target)}/subdomains?children_only=false`;
    const script = `curl -s -H "APIKEY: $SECURITYTRAILS_API_KEY" -H 'Accept: application/json' ${url} || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'securitytrails-json' }],
  produces: ['Subdomain'],
};
