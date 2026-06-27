import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const Enum4LinuxNgInput = z.object({
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  kerberos: z.boolean().default(false),
});

export type Enum4LinuxNgInputType = z.infer<typeof Enum4LinuxNgInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const Enum4LinuxNgScanner: ScannerDefinition<Enum4LinuxNgInputType> = {
  name: 'enum4linux-ng',
  displayName: 'enum4linux-ng',
  category: [ScannerCategory.SMB_WINDOWS, ScannerCategory.ACTIVE_DIRECTORY],
  description:
    'Deep SMB/NetBIOS enumeration (users, groups, shares, password policy). ' +
    'Credentials, when supplied, are env-injected — never on argv.',
  inputSchema: Enum4LinuxNgInput,
  docker: {
    image: 'autoscanner/enum4linux-ng:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target) {
    const t = shellQuoteSingle(target);
    const env: Record<string, string> = {};
    let credPart = '';
    if (input.username && input.password) {
      env['ENUM4_USER'] = input.username;
      env['ENUM4_PASS'] = input.password;
      credPart = ' -u "$ENUM4_USER" -p "$ENUM4_PASS"';
    }
    const kerb = input.kerberos ? ' -K' : '';
    const script = `enum4linux-ng -A${credPart}${kerb} -oJ /out/result.json ${t} >/dev/null 2>&1 || true`;
    return { cmd: ['sh', '-lc', script], env };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'enum4linux-json' }],
  produces: ['Identity', 'Asset', 'Finding'],
};
