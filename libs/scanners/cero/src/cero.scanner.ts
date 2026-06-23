import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const CeroInput = z.object({
  /** Comma-separated TLS ports to connect to. */
  ports: z.string().default('443'),
  concurrency: z.number().int().min(1).max(1_000).default(100),
});
export type CeroInputType = z.infer<typeof CeroInput>;

export const CeroScanner: ScannerDefinition<CeroInputType> = {
  name: 'cero',
  displayName: 'Cero (TLS-cert domain scrape)',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.SSL_TLS],
  description:
    'Connects to TLS ports on the target host(s)/range and scrapes domain names from ' +
    'certificate CN/SAN fields (cero). Light TLS handshakes only. Target may be a host, IP or CIDR.',
  inputSchema: CeroInput,
  docker: {
    image: 'autoscanner/cero:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    // argv form (no shell): cero reads positional target; ports/concurrency are
    // schema-validated (string/number) so no shell metacharacters reach a shell.
    return { cmd: ['cero', '-p', input.ports, '-c', String(input.concurrency), target] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Domain', 'Subdomain'],
};
