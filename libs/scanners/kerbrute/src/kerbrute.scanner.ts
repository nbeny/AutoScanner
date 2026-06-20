import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const KerbruteInput = z.object({
  /** Optional explicit DC host/IP; if omitted kerbrute auto-discovers the KDC via DNS SRV. */
  dc: z.string().optional(),
  /** Username list path inside the image. */
  userlist: z.string().default('/etc/kerbrute/userlist.txt'),
});

export type KerbruteInputType = z.infer<typeof KerbruteInput>;

export const KerbruteScanner: ScannerDefinition<KerbruteInputType> = {
  name: 'kerbrute',
  displayName: 'Kerbrute (Kerberos enum)',
  category: [ScannerCategory.ACTIVE_DIRECTORY],
  description:
    'Unauthenticated Kerberos user enumeration and AS-REP roasting (kerbrute userenum). ' +
    'Targets the AD domain; auto-discovers the KDC via DNS. Custom-built image with a bundled userlist.',
  inputSchema: KerbruteInput,
  docker: {
    image: 'autoscanner/kerbrute:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const cmd = ['kerbrute', 'userenum', '-d', target, '-o', '/dev/stdout'];
    if (input.dc) cmd.push('--dc', input.dc);
    cmd.push(input.userlist);
    return { cmd };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'kerbrute-text' }],
  produces: ['Finding'],
};
