import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const TrufflehogInput = z.object({});
export type TrufflehogInputType = z.infer<typeof TrufflehogInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function orgFromTarget(target: string): string {
  return target.trim().toLowerCase().replace(/^\*\./, '').split('.')[0] ?? target;
}

export const TrufflehogScanner: ScannerDefinition<TrufflehogInputType> = {
  name: 'trufflehog',
  displayName: 'trufflehog (GitHub secrets)',
  category: [ScannerCategory.OSINT, ScannerCategory.VULN_SCAN],
  description:
    "Scans the org's public GitHub repos for leaked secrets. Requires a GITHUB_TOKEN credential.",
  inputSchema: TrufflehogInput,
  requiresCredential: 'GITHUB',
  credentialEnvVar: 'GITHUB_TOKEN',
  docker: {
    image: 'autoscanner/trufflehog:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(_input, target) {
    const org = orgFromTarget(target);
    const script = `GITHUB_TOKEN="$GITHUB_TOKEN" trufflehog github --org=${shellQuoteSingle(org)} --json 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'trufflehog-json' }],
  produces: ['Finding'],
};
