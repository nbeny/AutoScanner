import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GitDumperInput = z.object({
  baseUrl: z.string().url().optional(),
});
export type GitDumperInputType = z.infer<typeof GitDumperInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export const GitDumperScanner: ScannerDefinition<GitDumperInputType> = {
  name: 'git-dumper',
  displayName: 'git-dumper',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.OSINT],
  description:
    'Detects an exposed .git/ directory on a web host and, when found, dumps it (arthaud/' +
    'git-dumper) and sweeps the recovered tree for hard-coded secrets.',
  inputSchema: GitDumperInput,
  docker: {
    image: 'autoscanner/git-dumper:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false, // git-dumper writes the recovered repo under /tmp
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const base = shEscape(input.baseUrl ?? target);
    return { cmd: ['sh', '-lc', `gitdump-scan ${base} > /out/result.json`] };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'git-dumper-json' }],
  produces: ['Finding'],
};
