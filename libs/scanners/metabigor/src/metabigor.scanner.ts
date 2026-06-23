import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const MetabigorInput = z.object({});
export type MetabigorInputType = z.infer<typeof MetabigorInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const MetabigorScanner: ScannerDefinition<MetabigorInputType> = {
  name: 'metabigor',
  displayName: 'Metabigor (OSINT ASN/IP)',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    'Key-free OSINT discovery of an organisation’s netblocks/ASNs via metabigor ' +
    '(queries public BGP/registry sources). Does not touch the target.',
  inputSchema: MetabigorInput,
  docker: {
    image: 'autoscanner/metabigor:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    const script = `echo ${shellQuoteSingle(target)} | metabigor net --org --json || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'metabigor-json' }],
  produces: ['IpAddress', 'OrgMetadata'],
};
