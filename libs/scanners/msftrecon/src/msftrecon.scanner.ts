import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const MsftreconInput = z.object({});
export type MsftreconInputType = z.infer<typeof MsftreconInput>;

export const MsftreconScanner: ScannerDefinition<MsftreconInputType> = {
  name: 'msftrecon',
  displayName: 'msftrecon',
  category: [ScannerCategory.CLOUD, ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON],
  description:
    'Passive Azure / M365 tenant recon (dievus/msftrecon). Queries public M365 endpoints to ' +
    'extract tenant ID, federation brand, MTA-STS/SPF/DKIM, and MX hosts. No credentials needed.',
  inputSchema: MsftreconInput,
  docker: {
    image: 'autoscanner/msftrecon:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['python', '/opt/msftrecon/msftrecon.py', '-d', target, '-j'] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'msftrecon-json' }],
  produces: ['OrgMetadata', 'Finding'],
};
