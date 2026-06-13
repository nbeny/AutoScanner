import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const AmassInput = z.object({
  // amass -timeout is in MINUTES. Capped to keep passive runs bounded.
  timeoutMinutes: z.number().int().min(1).max(60).default(5),
});

export type AmassInputType = z.infer<typeof AmassInput>;

export const AmassScanner: ScannerDefinition<AmassInputType> = {
  name: 'amass',
  displayName: 'Amass (passive)',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'OWASP Amass subdomain enumeration, passive mode only.',
  inputSchema: AmassInput,
  docker: {
    image: 'caffix/amass:v4.2.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target) {
    return {
      cmd: [
        'amass',
        'enum',
        '-passive',
        '-d',
        target,
        '-nocolor',
        '-timeout',
        String(input.timeoutMinutes),
      ],
    };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Asset', 'Subdomain'],
};
