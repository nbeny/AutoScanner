import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const S3scannerInput = z.object({});

export type S3scannerInputType = z.infer<typeof S3scannerInput>;

export const S3scannerScanner: ScannerDefinition<S3scannerInputType> = {
  name: 's3scanner',
  displayName: 'S3Scanner (bucket perms)',
  category: [ScannerCategory.CLOUD],
  description:
    'Unauthenticated cloud bucket permission check (s3scanner): probes a named bucket and reports ' +
    'public read/list/write exposure. Complements cloud-enum (which only checks existence). Custom-built image.',
  inputSchema: S3scannerInput,
  docker: {
    image: 'autoscanner/s3scanner:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['s3scanner', '-json', 'scan', '-bucket', target] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 's3scanner-json' }],
  produces: ['Finding'],
};
