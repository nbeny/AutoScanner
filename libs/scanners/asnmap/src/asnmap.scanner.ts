import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const AsnmapInput = z.object({});
export type AsnmapInputType = z.infer<typeof AsnmapInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const AsnmapScanner: ScannerDefinition<AsnmapInputType> = {
  name: 'asnmap',
  displayName: 'asnmap (ASN/CIDR)',
  category: [ScannerCategory.PASSIVE_RECON, ScannerCategory.NETWORK_DISCOVERY],
  description:
    'Passive ASN and CIDR range discovery for an organisation/domain via asnmap. ' +
    'Queries public BGP/ASN data — does not touch the target.',
  inputSchema: AsnmapInput,
  docker: {
    image: 'autoscanner/asnmap:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    const script = `asnmap -d ${shellQuoteSingle(target)} -json -silent || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'asnmap-json' }],
  produces: ['OrgMetadata'],
};
