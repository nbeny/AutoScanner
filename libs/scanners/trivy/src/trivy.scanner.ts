import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const TrivyInput = z.object({
  /** What the target string refers to: a container image ref, a git repo URL, or a mounted path. */
  mode: z.enum(['image', 'repo', 'fs']).default('image'),
  /** Comma-separated Trivy severities to report. */
  severity: z
    .array(z.enum(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']))
    .default(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
});
export type TrivyInputType = z.infer<typeof TrivyInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const TrivyScanner: ScannerDefinition<TrivyInputType> = {
  name: 'trivy',
  displayName: 'Vulnerability scan (trivy)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.CONTAINER_K8S],
  description:
    'Scans a container image, git repository or filesystem path for known-CVE OS/language ' +
    'dependencies with Trivy. Each vulnerable package becomes a CVE-tagged finding. ' +
    'The target is the image ref / repo URL (set `mode` accordingly).',
  inputSchema: TrivyInput,
  docker: {
    image: 'autoscanner/trivy:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target, _ctx) {
    const sev = input.severity.join(',');
    const script =
      `trivy ${input.mode} --format json --quiet --no-progress --scanners vuln ` +
      `--severity ${sev} ${shellQuoteSingle(target)} 2>/dev/null || true`;
    return {
      cmd: ['sh', '-lc', script],
      // Keep Trivy's DB/cache on the writable tmpfs so the rootfs stays read-only.
      env: { TRIVY_CACHE_DIR: '/tmp/.trivy' },
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'trivy-json' }],
  produces: ['Finding'],
};
