import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GowitnessInput = z.object({});
export type GowitnessInputType = z.infer<typeof GowitnessInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const GowitnessScanner: ScannerDefinition<GowitnessInputType> = {
  name: 'gowitness',
  displayName: 'gowitness (screenshot)',
  category: [ScannerCategory.WEB_FINGERPRINT],
  description:
    'Captures a screenshot (PNG) of a web host via headless chromium (gowitness). ' +
    'Actively probes the target.',
  inputSchema: GowitnessInput,
  docker: {
    image: 'autoscanner/gowitness:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1536,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 180_000,
  },
  build(_input, target, ctx) {
    // gowitness v2 writes <host>.png into --screenshot-path; the worker bind-mounts
    // ctx.scratchDir (=/output) to a host dir and stores the produced PNG.
    // --disable-db skips the gowitness sqlite database (not needed for capture-only use).
    // `|| true` keeps exit 0 even when gowitness exits non-zero (common in headless
    // containers, e.g. partial chromium errors) AS LONG AS a PNG was written — the
    // scan-worker's "no artifact file" check is the real success signal. Downside:
    // the stored exitCode is always 0 for gowitness.
    const script = `gowitness single ${shellQuoteSingle(target)} --screenshot-path ${ctx.scratchDir} --disable-db || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'BINARY', capture: { path: '' }, parser: 'noop' }],
  produces: ['Screenshot'],
};
