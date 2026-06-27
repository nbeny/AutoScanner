import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const LinkfinderInput = z.object({
  outputFormat: z.enum(['cli', 'html']).default('cli'),
});
export type LinkfinderInputType = z.infer<typeof LinkfinderInput>;

export const LinkfinderScanner: ScannerDefinition<LinkfinderInputType> = {
  name: 'linkfinder',
  displayName: 'linkfinder',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.API_SECURITY],
  description:
    'Extracts endpoints and URLs from JavaScript files via regex (GerbenJavado/LinkFinder). ' +
    'Fast, broad coverage — pair with jsluice for AST-precise extraction.',
  inputSchema: LinkfinderInput,
  docker: {
    image: 'autoscanner/linkfinder:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    return {
      cmd: ['python', '/opt/linkfinder/linkfinder.py', '-i', target, '-o', input.outputFormat],
    };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'linkfinder-text' }],
  produces: ['Endpoint'],
};
