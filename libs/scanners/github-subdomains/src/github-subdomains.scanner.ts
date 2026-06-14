import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GithubSubdomainsInput = z.object({});
export type GithubSubdomainsInputType = z.infer<typeof GithubSubdomainsInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const GithubSubdomainsScanner: ScannerDefinition<GithubSubdomainsInputType> = {
  name: 'github-subdomains',
  displayName: 'github-subdomains',
  category: [ScannerCategory.OSINT, ScannerCategory.SUBDOMAIN_ENUM],
  description:
    'Finds subdomains of the target leaked in public GitHub code. Requires a GITHUB_TOKEN credential.',
  inputSchema: GithubSubdomainsInput,
  requiresCredential: 'GITHUB',
  credentialEnvVar: 'GITHUB_TOKEN',
  docker: {
    image: 'autoscanner/github-subdomains:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    const script = `github-subdomains -d ${shellQuoteSingle(target)} -t "$GITHUB_TOKEN" || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Subdomain'],
};
