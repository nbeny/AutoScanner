import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GcpBucketBruteInput = z.object({
  keyword: z.string().min(1).max(64).optional(),
  wordlistSize: z.enum(['small', 'medium', 'large']).default('small'),
});
export type GcpBucketBruteInputType = z.infer<typeof GcpBucketBruteInput>;

function shEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function keywordFromTarget(target: string): string {
  const label = target.trim().toLowerCase().replace(/^\*\./, '').split('.')[0] || target;
  return label;
}

export const GcpBucketBruteScanner: ScannerDefinition<GcpBucketBruteInputType> = {
  name: 'gcp-bucket-brute',
  displayName: 'GCP bucket brute (RhinoSec)',
  category: [ScannerCategory.CLOUD, ScannerCategory.OSINT],
  description:
    'Brute-force discovery of GCP Cloud Storage buckets with permission probing ' +
    '(RhinoSecurityLabs/GCPBucketBrute). Unauthenticated mode; bundled wordlists.',
  inputSchema: GcpBucketBruteInput,
  docker: {
    image: 'autoscanner/gcp-bucket-brute:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 768,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target) {
    const keyword = input.keyword ?? keywordFromTarget(target);
    const script =
      `python /opt/gcpbucketbrute/gcpbucketbrute.py -k ${shEscape(keyword)} -u ` +
      `-w /opt/wordlists/${input.wordlistSize}.txt -o /out/result.txt 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [
    { format: 'TEXT', capture: { path: '/out/result.txt' }, parser: 'gcp-bucket-brute-text' },
  ],
  produces: ['OrgMetadata', 'Finding'],
};
