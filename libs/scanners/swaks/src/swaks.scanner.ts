import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SwaksInput = z.object({
  port: z.number().int().min(1).max(65535).default(25),
  tls: z.enum(['none', 'starttls', 'tls']).default('starttls'),
});
export type SwaksInputType = z.infer<typeof SwaksInput>;

export const SwaksScanner: ScannerDefinition<SwaksInputType> = {
  name: 'swaks',
  displayName: 'swaks (SMTP handshake probe)',
  category: [ScannerCategory.SMTP],
  description:
    'Active SMTP handshake probe (jetmore/swaks). Captures banner, AUTH offers, STARTTLS ' +
    'support; never sends a message body. Gated by the `active-mail-probe` capability.',
  inputSchema: SwaksInput,
  docker: {
    image: 'autoscanner/swaks:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 180_000,
  },
  build(input, target) {
    const cmd = [
      'swaks',
      '--server',
      target,
      '--port',
      String(input.port),
      '--quit-after',
      'EHLO',
      '--no-data',
    ];
    if (input.tls === 'starttls') cmd.push('--tls');
    if (input.tls === 'tls') cmd.push('--tls-on-connect');
    return { cmd };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'swaks-text' }],
  produces: ['OrgMetadata', 'Finding'],
};
