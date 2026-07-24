import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const PwncatInput = z.object({
  port: z.number().int().positive(),
  probe: z.string().default('id'),
});

export type PwncatInputType = z.infer<typeof PwncatInput>;

export const PwncatScanner: ScannerDefinition<PwncatInputType> = {
  name: 'pwncat',
  displayName: 'pwncat (experimental exploit probe)',
  category: [ScannerCategory.VULN_SCAN],
  description:
    'EXPERIMENTAL, BEST-EFFORT exploit probe. Connects to a target port with pwncat-nc, sends a ' +
    'single benign, non-interactive probe command (default "id"), and flags a HIGH finding if the ' +
    'response looks like an unauthenticated shell / command execution (e.g. "uid=", "root@", a shell ' +
    'prompt). Bounded by a hard timeout and never hangs; emits no findings on a benign banner.',
  inputSchema: PwncatInput,
  docker: {
    image: 'autoscanner/pwncat:1.0',
    network: 'host',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 500_000,
    defaultTimeoutMs: 60_000,
  },
  build(input, target) {
    const probe = (input.probe ?? 'id').replace(/'/g, '');
    const script = `printf '%s\\n' '${probe}' | timeout 20 pwncat-nc -w 5 ${target} ${input.port} 2>/dev/null || true`;
    return { cmd: ['sh', '-c', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'pwncat-text' }],
  produces: ['Finding'],
};
