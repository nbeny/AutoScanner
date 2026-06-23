import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SubjsInput = z.object({});
export type SubjsInputType = z.infer<typeof SubjsInput>;

export const SubjsScanner: ScannerDefinition<SubjsInputType> = {
  name: 'subjs',
  displayName: 'subjs (JS file discovery)',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.PASSIVE_RECON],
  description:
    'Fetches a page and extracts the URLs of referenced JavaScript files, feeding downstream ' +
    'JS analysis (endpoints, secrets). Key-free.',
  inputSchema: SubjsInput,
  docker: {
    image: 'autoscanner/subjs:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target, _ctx) {
    // Feed both https and http forms of the host into subjs on stdin.
    const script = `printf 'https://%s\\nhttp://%s\\n' '${target}' '${target}' | subjs || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'subjs-text' }],
  produces: ['Endpoint'],
};
