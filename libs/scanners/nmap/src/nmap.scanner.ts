import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const NmapInput = z.object({
  ports: z.string().default('1-1000'),
  serviceDetection: z.boolean().default(true),
  osDetection: z.boolean().default(false),
  timingTemplate: z.number().int().min(0).max(5).default(4),
  scripts: z.array(z.string()).default([]),
  customArgs: z.array(z.string()).default([]),
});

export type NmapInputType = z.infer<typeof NmapInput>;

export const NmapScanner: ScannerDefinition<NmapInputType> = {
  name: 'nmap',
  displayName: 'Nmap',
  category: [
    ScannerCategory.PORT_SCAN,
    ScannerCategory.SERVICE_DETECTION,
    ScannerCategory.NETWORK_DISCOVERY,
  ],
  description: 'Network exploration and port scanner.',
  inputSchema: NmapInput,
  docker: {
    image: 'instrumentisto/nmap:7.98-r2',
    fallbackImage: 'autoscanner/kali-runner:latest',
    network: 'host',
    capabilities: ['NET_RAW', 'NET_ADMIN', 'NET_BIND_SERVICE'],
    readonlyRootfs: false,
    memoryLimitMb: 1024,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 3_600_000,
  },
  build(input, target) {
    const args = ['-oX', '-', '-Pn', `-T${input.timingTemplate}`];
    if (input.serviceDetection) args.push('-sV');
    if (input.osDetection) args.push('-O');
    if (input.scripts.length) args.push('--script', input.scripts.join(','));
    args.push('-p', input.ports, ...input.customArgs, target);
    return { cmd: ['nmap', ...args] };
  },
  outputs: [{ format: 'XML', capture: 'stdout', parser: 'nmap-xml' }],
  produces: ['Asset', 'Port', 'Service', 'Technology'],
};
