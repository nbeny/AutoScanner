import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SpoofyInput = z.object({});
export type SpoofyInputType = z.infer<typeof SpoofyInput>;

export const SpoofyScanner: ScannerDefinition<SpoofyInputType> = {
  name: 'spoofy',
  displayName: 'spoofy (spoofability synthesis)',
  category: [ScannerCategory.OSINT, ScannerCategory.SMTP],
  description:
    'Synthesizes SPF + DMARC records into a single spoofability verdict ' +
    '(MattKeeley/Spoofy). Complementary to mailspoof.',
  inputSchema: SpoofyInput,
  docker: {
    image: 'autoscanner/spoofy:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['python', '/opt/spoofy/spoofy.py', '-d', target, '-o', 'json'] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'spoofy-json' }],
  produces: ['Finding'],
};
