import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const WpscanInput = z.object({
  /** Passthrough for wpscan --enumerate (default vp,vt,u = vuln plugins/themes + users). */
  enumerate: z.string().optional(),
});

export type WpscanInputType = z.infer<typeof WpscanInput>;

export const WpscanScanner: ScannerDefinition<WpscanInputType> = {
  name: 'wpscan',
  displayName: 'WPScan',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.WEB_FINGERPRINT],
  description:
    'WordPress enumeration (WPScan): core/plugin/theme versions, users, exposed files. ' +
    'Runs unauthenticated; plugin/theme versions feed the CPE-CVE correlation engine. Custom-built image.',
  inputSchema: WpscanInput,
  docker: {
    image: 'autoscanner/wpscan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const enumerate = input.enumerate ?? 'vp,vt,u';
    return {
      cmd: [
        'wpscan',
        '--url',
        target,
        '--format',
        'json',
        '--no-banner',
        '--random-user-agent',
        '--enumerate',
        enumerate,
      ],
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'wpscan-json' }],
  produces: ['Technology', 'Finding'],
};
