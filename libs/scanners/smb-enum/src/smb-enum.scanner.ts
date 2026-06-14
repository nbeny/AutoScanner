import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SmbEnumInput = z.object({});
export type SmbEnumInputType = z.infer<typeof SmbEnumInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const SmbEnumScanner: ScannerDefinition<SmbEnumInputType> = {
  name: 'smb-enum',
  displayName: 'SMB / Windows enum',
  category: [ScannerCategory.SMB_WINDOWS],
  description:
    'Anonymous SMB/Windows enumeration (shares, OS, users, null session) via enum4linux-ng. Read-only.',
  inputSchema: SmbEnumInput,
  docker: {
    image: 'autoscanner/smb-enum:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    const t = shellQuoteSingle(target);
    const script = `enum4linux-ng -A ${t} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'smb-text' }],
  produces: ['Finding', 'OrgMetadata'],
};
