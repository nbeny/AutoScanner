import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const CloudEnumInput = z.object({});
export type CloudEnumInputType = z.infer<typeof CloudEnumInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function keywordFromTarget(target: string): string {
  const label = target.trim().toLowerCase().replace(/^\*\./, '').split('.')[0] ?? target;
  return label;
}

export const CloudEnumScanner: ScannerDefinition<CloudEnumInputType> = {
  name: 'cloud-enum',
  displayName: 'cloud_enum (S3/Azure/GCS)',
  category: [ScannerCategory.CLOUD, ScannerCategory.OSINT],
  description:
    'Passive enumeration of public cloud storage (S3/Azure/GCS) from the target keyword. ' +
    'Touches cloud provider endpoints, not the target.',
  inputSchema: CloudEnumInput,
  docker: {
    image: 'autoscanner/cloud-enum:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    const kw = keywordFromTarget(target);
    const script = `cloud_enum -k ${shellQuoteSingle(kw)} --disable-azure --quickscan 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'cloud-enum-text' }],
  produces: ['OrgMetadata', 'Finding'],
};
