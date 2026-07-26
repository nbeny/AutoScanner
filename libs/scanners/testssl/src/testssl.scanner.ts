import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const TestsslInput = z.object({
  /** Skip the slower cipher-enumeration passes for a quicker audit. */
  fast: z.boolean().default(true),
});
export type TestsslInputType = z.infer<typeof TestsslInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const TestsslScanner: ScannerDefinition<TestsslInputType> = {
  name: 'testssl',
  displayName: 'TLS/SSL deep audit (testssl.sh)',
  category: [ScannerCategory.SSL_TLS],
  description:
    'Deep TLS/SSL audit with testssl.sh: protocol/cipher support, certificate issues and named ' +
    'vulnerabilities (Heartbleed, ROBOT, POODLE, BEAST, …) with CVE tags. Complements sslscan/tlsx ' +
    'with far broader vulnerability coverage. Target is host[:port] or a URL (defaults to :443).',
  inputSchema: TestsslInput,
  docker: {
    image: 'autoscanner/testssl:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target, _ctx) {
    const fast = input.fast ? '--fast' : '';
    // testssl.sh writes structured results to a JSON file; emit it on stdout for
    // the parser. /tmp is a writable tmpfs under the readonly rootfs.
    const script =
      `testssl.sh --quiet --color 0 ${fast} --jsonfile /tmp/testssl.json ` +
      `${shellQuoteSingle(target)} >/dev/null 2>&1 || true; ` +
      `cat /tmp/testssl.json 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'testssl-json' }],
  produces: ['Finding'],
};
