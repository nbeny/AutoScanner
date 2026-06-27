import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const Graphw00fInput = z.object({
  detect: z.boolean().default(true),
  fingerprint: z.boolean().default(true),
});
export type Graphw00fInputType = z.infer<typeof Graphw00fInput>;

export const Graphw00fScanner: ScannerDefinition<Graphw00fInputType> = {
  name: 'graphw00f',
  displayName: 'graphw00f',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.API_SECURITY],
  description:
    'GraphQL engine fingerprint + endpoint discovery (dolevf/graphw00f). Detects ~30 common ' +
    'GraphQL paths and identifies the engine (Apollo, Hasura, Graphene, Lighthouse...).',
  inputSchema: Graphw00fInput,
  docker: {
    image: 'autoscanner/graphw00f:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    const cmd = ['python', '/opt/graphw00f/main.py'];
    if (input.detect) cmd.push('-d');
    if (input.fingerprint) cmd.push('-f');
    cmd.push('-t', target, '-o', '/out/result.json');
    return { cmd };
  },
  outputs: [{ format: 'JSON', capture: { path: '/out/result.json' }, parser: 'graphw00f-json' }],
  produces: ['Endpoint', 'Technology'],
};
