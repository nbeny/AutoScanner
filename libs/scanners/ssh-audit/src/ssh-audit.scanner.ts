import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SshAuditInput = z.object({
  port: z.number().int().positive().default(22),
});

export type SshAuditInputType = z.infer<typeof SshAuditInput>;

export const SshAuditScanner: ScannerDefinition<SshAuditInputType> = {
  name: 'ssh-audit',
  displayName: 'SSH Audit',
  category: [ScannerCategory.SERVICE_DETECTION],
  description:
    'Audits SSH server algorithms, key exchange methods, ciphers, and MACs (jtesta/ssh-audit). ' +
    'Emits HIGH findings for broken algorithms and MEDIUM for weak ones. ' +
    'Produces empty output if port is not open.',
  inputSchema: SshAuditInput,
  docker: {
    image: 'autoscanner/ssh-audit:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(input, target) {
    return { cmd: ['ssh-audit', '--json', '-p', String(input.port), target] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'ssh-audit-json' }],
  produces: ['Finding'],
};
