import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const AbuseipdbInput = z.object({});
export type AbuseipdbInputType = z.infer<typeof AbuseipdbInput>;

export const AbuseipdbScanner: ScannerDefinition<AbuseipdbInputType> = {
  name: 'abuseipdb',
  displayName: 'AbuseIPDB',
  category: [ScannerCategory.PASSIVE_RECON, ScannerCategory.OSINT],
  description:
    'Queries the AbuseIPDB v2 API to check if an IP has been reported for abuse. ' +
    'Free key required (1000 checks/day at abuseipdb.com/register). ' +
    'Emits HIGH finding for confidence ≥ 75, MEDIUM for 25–74, INFO for 1–24.',
  inputSchema: AbuseipdbInput,
  docker: {
    image: 'autoscanner/abuseipdb:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 128,
    cpuQuota: 500_000,
    defaultTimeoutMs: 30_000,
  },
  build(_input, target) {
    return { cmd: ['python3', '/usr/local/bin/check.py', target] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'abuseipdb-json' }],
  produces: ['Finding'],
  requiresCredential: 'ABUSEIPDB',
  credentialEnvVar: 'ABUSEIPDB_API_KEY',
};
