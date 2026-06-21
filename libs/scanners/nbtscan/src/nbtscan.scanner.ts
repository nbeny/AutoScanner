import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const NbtscanInput = z.object({});
export type NbtscanInputType = z.infer<typeof NbtscanInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const NbtscanScanner: ScannerDefinition<NbtscanInputType> = {
  name: 'nbtscan',
  displayName: 'NBTScan',
  category: [ScannerCategory.SMB_WINDOWS, ScannerCategory.NETWORK_DISCOVERY],
  description:
    'NetBIOS name scanner. Resolves Windows hostname, workgroup, and MAC address from an IP. ' +
    'Useful for identifying Windows hosts on LAN segments without credentials. ' +
    'Produces empty output for non-Windows hosts.',
  inputSchema: NbtscanInput,
  docker: {
    image: 'autoscanner/nbtscan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 128,
    cpuQuota: 500_000,
    defaultTimeoutMs: 60_000,
  },
  build(_input, target) {
    const t = shellQuoteSingle(target);
    return { cmd: ['sh', '-c', `nbtscan -v ${t} 2>/dev/null || true`] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'nbtscan-text' }],
  produces: ['Asset', 'Finding'],
};
