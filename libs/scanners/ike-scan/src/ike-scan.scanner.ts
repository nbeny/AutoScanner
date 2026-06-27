import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const IkeScanInput = z.object({
  targets: z.array(z.string().min(1)).default([]),
  aggressive: z.boolean().default(false),
  transformSet: z
    .string()
    .regex(/^[\d,]+$/)
    .optional(),
});

export type IkeScanInputType = z.infer<typeof IkeScanInput>;

/**
 * IPsec/IKE fingerprint. Requires raw UDP/500 — bridged networking breaks
 * the IKE handshake, hence host networking + NET_RAW. Gated by the
 * `active-recon-host-net` capability flag at the api-gateway level
 * (see ScansService.runScan).
 */
export const IkeScanScanner: ScannerDefinition<IkeScanInputType> = {
  name: 'ike-scan',
  displayName: 'ike-scan (IPsec/IKE discovery)',
  category: [ScannerCategory.NETWORK_DISCOVERY, ScannerCategory.SERVICE_DETECTION],
  description:
    'IPsec/IKE VPN discovery and fingerprinting. Documented host-network exception ' +
    '(raw UDP/500) — gated by operator capability `active-recon-host-net`.',
  inputSchema: IkeScanInput,
  docker: {
    image: 'autoscanner/ike-scan:1.0',
    network: 'host',
    capabilities: ['NET_RAW'],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(input, target) {
    const targets = input.targets.length > 0 ? input.targets : [target];
    if (input.aggressive) {
      const cmd = ['ike-scan', '-A', '-n', 'testid', '-P'];
      if (input.transformSet) cmd.push(`--trans=${input.transformSet}`);
      cmd.push(...targets);
      return { cmd };
    }
    return { cmd: ['ike-scan', '-M', ...targets] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'ike-scan-text' }],
  produces: ['Service', 'Finding'],
};
