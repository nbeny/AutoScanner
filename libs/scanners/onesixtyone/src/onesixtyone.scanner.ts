import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const OnesixtyoneInput = z.object({
  targets: z.array(z.string().min(1)).default([]),
  communityList: z.array(z.string().min(1)).default([]),
});

export type OnesixtyoneInputType = z.infer<typeof OnesixtyoneInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const OnesixtyoneScanner: ScannerDefinition<OnesixtyoneInputType> = {
  name: 'onesixtyone',
  displayName: 'onesixtyone (SNMP community brute)',
  category: [ScannerCategory.NETWORK_DISCOVERY, ScannerCategory.SNMP],
  description:
    'High-speed SNMPv1/v2c community brute. Tries the bundled default-weak community list ' +
    'against UDP/161, emits a MEDIUM finding when a weak community is accepted.',
  inputSchema: OnesixtyoneInput,
  docker: {
    image: 'autoscanner/onesixtyone:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const targets = input.targets.length > 0 ? input.targets : [target];
    const targetLines = targets.map((t) => shellQuoteSingle(t)).join('\\n');
    const writeTargets = `printf '%b' ${shellQuoteSingle(targetLines)} > /tmp/t.txt`;

    let communityArg: string;
    if (input.communityList.length > 0) {
      const lines = input.communityList.map((c) => shellQuoteSingle(c)).join('\\n');
      communityArg = `printf '%b' ${shellQuoteSingle(lines)} > /tmp/c.txt && onesixtyone -c /tmp/c.txt -i /tmp/t.txt -o /tmp/out 2>/dev/null; cat /tmp/out`;
    } else {
      communityArg = `onesixtyone -c /opt/onesixtyone/communities.txt -i /tmp/t.txt -o /tmp/out 2>/dev/null; cat /tmp/out`;
    }
    const script = `${writeTargets} && ${communityArg}`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'onesixtyone-text' }],
  produces: ['Service', 'Finding'],
};
