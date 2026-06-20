import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const LdapEnumInput = z.object({});

export type LdapEnumInputType = z.infer<typeof LdapEnumInput>;

// Single-quote a shell argument safely (reuse smb-enum's helper if it exports one).
function shq(value: string): string {
  return "'" + value.split("'").join("'\\''") + "'";
}

export const LdapEnumScanner: ScannerDefinition<LdapEnumInputType> = {
  name: 'ldap-enum',
  displayName: 'LDAP anonymous enum',
  category: [ScannerCategory.ACTIVE_DIRECTORY],
  description:
    'Anonymous LDAP RootDSE enumeration (ldapsearch): recovers the domain naming context and ' +
    'whether the DC answers anonymous queries. Read-only, unauthenticated. Custom-built image.',
  inputSchema: LdapEnumInput,
  docker: {
    image: 'autoscanner/ldap-enum:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    const url = `ldap://${target}`;
    const script =
      `ldapsearch -x -o ldif-wrap=no -H ${shq(url)} -s base -b "" "(objectclass=*)" ` +
      `namingContexts defaultNamingContext dnsHostName supportedSASLMechanisms 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'ldap-text' }],
  produces: ['Finding', 'OrgMetadata'],
};
