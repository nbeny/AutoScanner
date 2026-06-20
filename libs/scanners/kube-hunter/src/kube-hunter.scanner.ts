import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const KubeHunterInput = z.object({});

export type KubeHunterInputType = z.infer<typeof KubeHunterInput>;

export const KubeHunterScanner: ScannerDefinition<KubeHunterInputType> = {
  name: 'kube-hunter',
  displayName: 'kube-hunter (cluster recon)',
  category: [ScannerCategory.CONTAINER_K8S],
  description:
    'Unauthenticated remote Kubernetes cluster recon (kube-hunter --remote): discovers exposed ' +
    'API/kubelet/dashboard misconfigurations. Passive remote probe set only (no active exploitation).',
  inputSchema: KubeHunterInput,
  docker: {
    image: 'aquasec/kube-hunter:0.6.8',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(_input, target) {
    return { cmd: ['kube-hunter', '--remote', target, '--report', 'json', '--log', 'none'] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'kube-hunter-json' }],
  produces: ['Finding'],
};
