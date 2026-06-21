import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const RdpSecCheckInput = z.object({
  port: z.number().int().positive().default(3389),
});

export type RdpSecCheckInputType = z.infer<typeof RdpSecCheckInput>;

export const RdpSecCheckScanner: ScannerDefinition<RdpSecCheckInputType> = {
  name: 'rdp-sec-check',
  displayName: 'RDP Security Check',
  category: [ScannerCategory.SERVICE_DETECTION],
  description:
    'Checks RDP (port 3389) for NLA enforcement, encryption level, and CredSSP configuration ' +
    '(CiscoCXSecurity/rdp-sec-check). Emits HIGH findings for NLA disabled or weak encryption. ' +
    'Produces empty output if port is closed.',
  inputSchema: RdpSecCheckInput,
  docker: {
    image: 'autoscanner/rdp-sec-check:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 500_000,
    defaultTimeoutMs: 60_000,
  },
  build(input, target) {
    const script = `perl /usr/local/bin/rdp-sec-check.pl ${target}:${input.port} 2>/dev/null || true`;
    return { cmd: ['sh', '-c', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'rdp-sec-check-text' }],
  produces: ['Finding'],
};
