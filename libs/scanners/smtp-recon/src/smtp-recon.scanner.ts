import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SmtpReconInput = z.object({});
export type SmtpReconInputType = z.infer<typeof SmtpReconInput>;

export const SmtpReconScanner: ScannerDefinition<SmtpReconInputType> = {
  name: 'smtp-recon',
  displayName: 'SMTP recon (nmap NSE)',
  category: [ScannerCategory.SMTP],
  description:
    'Probes SMTP services (25/465/587) for capabilities, open-relay and user enumeration via nmap NSE. Actively probes the target.',
  inputSchema: SmtpReconInput,
  docker: {
    image: 'instrumentisto/nmap:7.98-r2',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    // target is a direct exec arg (no shell), so no shell-injection surface.
    return {
      cmd: [
        'nmap',
        '-oX',
        '-',
        '-Pn',
        '-p',
        '25,465,587',
        '--script',
        'smtp-commands,smtp-open-relay,smtp-enum-users',
        target,
      ],
    };
  },
  outputs: [{ format: 'XML', capture: 'stdout', parser: 'smtp-nmap-xml' }],
  produces: ['Finding', 'OrgMetadata'],
};
