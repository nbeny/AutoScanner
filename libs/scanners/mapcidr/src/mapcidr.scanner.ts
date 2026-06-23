import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const MapcidrInput = z.object({
  /** When > 0, emit a random sample of N hosts instead of the full expansion. */
  sampleSize: z.number().int().min(0).max(65_536).default(0),
});
export type MapcidrInputType = z.infer<typeof MapcidrInput>;

export const MapcidrScanner: ScannerDefinition<MapcidrInputType> = {
  name: 'mapcidr',
  displayName: 'MapCIDR (CIDR expansion)',
  category: [ScannerCategory.NETWORK_DISCOVERY],
  description:
    'Expands a CIDR range into individual IP addresses (mapcidr). Pure computation — ' +
    'does not touch any host. Set the target to a CIDR (e.g. 10.0.0.0/24).',
  inputSchema: MapcidrInput,
  docker: {
    image: 'projectdiscovery/mapcidr:v1.1.34',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(input, target) {
    // argv form: target is a CIDR (no shell metacharacters of concern), so no
    // shell wrapper / quoting needed.
    const cmd = ['mapcidr', '-cidr', target, '-silent'];
    if (input.sampleSize > 0) {
      cmd.push('-sample', String(input.sampleSize));
    }
    return { cmd };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'iplines-text' }],
  produces: ['IpAddress'],
};
