import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const KubeletctlInput = z.object({});

export type KubeletctlInputType = z.infer<typeof KubeletctlInput>;

export const KubeletctlScanner: ScannerDefinition<KubeletctlInputType> = {
  name: 'kubeletctl',
  displayName: 'kubeletctl (kubelet enum)',
  category: [ScannerCategory.CONTAINER_K8S],
  description:
    'Enumerates an exposed, anonymously-accessible kubelet API (TCP 10250) by listing pods ' +
    '(kubeletctl pods). A successful listing indicates anonymous kubelet access. Custom-built image.',
  inputSchema: KubeletctlInput,
  docker: {
    image: 'autoscanner/kubeletctl:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    return { cmd: ['kubeletctl', 'pods', '--server', target, '-o', 'json'] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'kubeletctl-json' }],
  produces: ['Finding'],
};
