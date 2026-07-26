import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SmugglerInput = z.object({
  /** smuggler test set: 'exhaustive' probes every mutation, 'basic' is faster. */
  mode: z.enum(['exhaustive', 'basic']).default('exhaustive'),
});
export type SmugglerInputType = z.infer<typeof SmugglerInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const SmugglerScanner: ScannerDefinition<SmugglerInputType> = {
  name: 'smuggler',
  displayName: 'HTTP request smuggling (smuggler)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Probes a URL for HTTP request smuggling (CL.TE / TE.CL desync) with smuggler. ' +
    'Reports the desync class when the front-end and back-end disagree on request boundaries.',
  inputSchema: SmugglerInput,
  docker: {
    image: 'autoscanner/smuggler:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, _ctx) {
    // smuggler writes a payloads/ dir on a hit; run from the writable tmpfs.
    const script =
      `cd /tmp && smuggler -u ${shellQuoteSingle(target)} -q ` +
      `${input.mode === 'basic' ? '-t basic' : ''} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'smuggler-text' }],
  produces: ['Finding'],
};
