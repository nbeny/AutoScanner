import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const JsReconInput = z.object({});
export type JsReconInputType = z.infer<typeof JsReconInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const JsReconScanner: ScannerDefinition<JsReconInputType> = {
  name: 'js-recon',
  displayName: 'JS recon (endpoints + secrets)',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.VULN_SCAN],
  description:
    "Discovers a host's JS files, extracts hidden endpoints (linkfinder) and exposed secrets (regex). Actively probes the target.",
  inputSchema: JsReconInput,
  docker: {
    image: 'autoscanner/js-recon:1.0',
    network: 'bridge',
    capabilities: [],
    // readonlyRootfs is safe: the docker-runner always mounts /tmp as tmpfs, so the
    // wrapper's `mktemp -d` and temp files work despite a read-only root filesystem.
    readonlyRootfs: true,
    memoryLimitMb: 768,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(_input, target) {
    // `js-recon` is a wrapper script baked into the image (subjs → fetch JS → linkfinder + secret regex → single JSON).
    const script = `js-recon ${shellQuoteSingle(target)} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'js-recon-json' }],
  produces: ['Endpoint', 'Finding'],
};
