import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const NiktoInput = z.object({
  /** Passthrough for nikto -Tuning (test categories). */
  tuning: z.string().optional(),
});

export type NiktoInputType = z.infer<typeof NiktoInput>;

export const NiktoScanner: ScannerDefinition<NiktoInputType> = {
  name: 'nikto',
  displayName: 'Nikto',
  category: [ScannerCategory.WEB_ENUM],
  description:
    'Web-server misconfiguration scanner (Nikto): dangerous files, missing headers, ' +
    'outdated software, default content. Actively probes the target. Custom-built image.',
  inputSchema: NiktoInput,
  docker: {
    image: 'autoscanner/nikto:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target, ctx) {
    const outFile = `${ctx.scratchDir}/nikto.json`;
    const cmd = ['nikto', '-h', target, '-Format', 'json', '-output', outFile, '-ask', 'no'];
    if (input.tuning) cmd.push('-Tuning', input.tuning);
    return { cmd };
  },
  outputs: [{ format: 'JSON', capture: { path: 'nikto.json' }, parser: 'nikto-json' }],
  produces: ['Finding'],
};
