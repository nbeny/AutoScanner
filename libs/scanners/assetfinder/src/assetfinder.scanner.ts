import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const AssetfinderInput = z.object({});

export type AssetfinderInputType = z.infer<typeof AssetfinderInput>;

export const AssetfinderScanner: ScannerDefinition<AssetfinderInputType> = {
  name: 'assetfinder',
  displayName: 'Assetfinder',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'Passive subdomain discovery (assetfinder). Custom-built image.',
  inputSchema: AssetfinderInput,
  docker: {
    // Built locally via tools/scanners/build-images.sh — not on a registry.
    image: 'autoscanner/assetfinder:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['assetfinder', '--subs-only', target] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Asset', 'Subdomain'],
};
