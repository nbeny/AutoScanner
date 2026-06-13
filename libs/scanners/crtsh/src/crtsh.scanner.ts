import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const CrtshInput = z.object({});

export type CrtshInputType = z.infer<typeof CrtshInput>;

export const CrtshScanner: ScannerDefinition<CrtshInputType> = {
  name: 'crtsh',
  displayName: 'crt.sh',
  category: [ScannerCategory.OSINT, ScannerCategory.PASSIVE_RECON, ScannerCategory.SUBDOMAIN_ENUM],
  description: 'Certificate transparency subdomain discovery via crt.sh JSON API.',
  inputSchema: CrtshInput,
  docker: {
    image: 'autoscanner/crtsh:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    return {
      cmd: [
        'curl',
        '-s',
        '-H',
        'User-Agent: autoscanner',
        `https://crt.sh/?q=%25.${target}&output=json`,
      ],
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'crtsh-json' }],
  produces: ['Asset', 'Subdomain'],
};
