import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const ArjunInput = z.object({
  method: z.enum(['GET', 'POST']).optional(),
});

export type ArjunInputType = z.infer<typeof ArjunInput>;

export const ArjunScanner: ScannerDefinition<ArjunInputType> = {
  name: 'arjun',
  displayName: 'Arjun',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.API_SECURITY],
  description:
    'HTTP parameter discovery (Arjun): finds hidden GET/POST parameters on a URL. ' +
    'Targets specific URLs; results surface as an informational finding. Custom-built image.',
  inputSchema: ArjunInput,
  docker: {
    image: 'autoscanner/arjun:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target, ctx) {
    const cmd = ['arjun', '-u', target, '-oJ', `${ctx.scratchDir}/arjun.json`];
    if (input.method) cmd.push('-m', input.method);
    return { cmd };
  },
  outputs: [{ format: 'JSON', capture: { path: 'arjun.json' }, parser: 'arjun-json' }],
  produces: ['Finding'],
};
