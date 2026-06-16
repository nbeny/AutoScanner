import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

export const OpenvasScanScanner: ScannerDefinition<Record<string, never>> = {
  name: 'openvas-scan',
  displayName: 'Network vuln scan (OpenVAS/openvasd)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.NETWORK_ANALYSIS],
  description:
    'Active network/host vulnerability scanning via Greenbone openvasd (verified NVT checks, CVE-tagged). ' +
    'Requires an OPENVAS API-key credential and the running greenbone stack. Actively probes the target.',
  inputSchema: z.object({}),
  requiresCredential: 'OPENVAS',
  credentialEnvVar: 'OPENVASD_API_KEY',
  docker: {
    image: 'autoscanner/openvas-scan:1.0',
    network: { name: 'autoscanner-greenbone' },
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 1_800_000,
  },
  build(_input, target) {
    return {
      cmd: ['openvas-scan-run', target],
      env: { OPENVASD_URL: 'http://openvasd:3000' },
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'openvasd-json' }],
  produces: ['Finding'],
};
