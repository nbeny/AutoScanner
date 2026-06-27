import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const HEADER_KEY = /^[A-Za-z0-9-]+$/;

const GraphqlCopInput = z.object({
  headers: z.record(z.string().regex(HEADER_KEY), z.string()).default({}),
});
export type GraphqlCopInputType = z.infer<typeof GraphqlCopInput>;

export const GraphqlCopScanner: ScannerDefinition<GraphqlCopInputType> = {
  name: 'graphql-cop',
  displayName: 'graphql-cop',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.API_SECURITY],
  description:
    'GraphQL security audit (dolevf/graphql-cop). Probes introspection, batching, field ' +
    'suggestions, alias overloading, mutation over GET. Severity filtering is done at the ' +
    'findings list / dashboard UI; the parser emits every classified entry.',
  inputSchema: GraphqlCopInput,
  docker: {
    image: 'autoscanner/graphql-cop:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const headerPairs: string[] = [];
    for (const [k, v] of Object.entries(input.headers)) {
      headerPairs.push('-H', `${k}: ${v}`);
    }
    return {
      cmd: [
        'python',
        '/opt/graphql-cop/graphql-cop.py',
        '-t',
        target,
        '-o',
        'json',
        ...headerPairs,
      ],
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'graphql-cop-json' }],
  produces: ['Finding'],
};
