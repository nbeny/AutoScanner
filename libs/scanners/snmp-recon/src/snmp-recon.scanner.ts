import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SnmpReconInput = z.object({});
export type SnmpReconInputType = z.infer<typeof SnmpReconInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const SnmpReconScanner: ScannerDefinition<SnmpReconInputType> = {
  name: 'snmp-recon',
  displayName: 'SNMP recon',
  category: [ScannerCategory.SNMP],
  description:
    'Checks SNMP (161/udp) for readable public/common community strings and device info. Read-only enumeration.',
  inputSchema: SnmpReconInput,
  docker: {
    image: 'autoscanner/snmp-recon:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 180_000,
  },
  build(_input, target) {
    const t = shellQuoteSingle(target);
    // onesixtyone tries a community list; snmpwalk grabs sysDescr if 'public' works.
    const script = `onesixtyone ${t} public private community manager 2>/dev/null; snmpwalk -v2c -c public -t 2 ${t} 1.3.6.1.2.1.1 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'snmp-text' }],
  produces: ['Finding', 'OrgMetadata'],
};
