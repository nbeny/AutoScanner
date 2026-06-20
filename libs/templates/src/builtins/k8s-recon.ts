import type { TemplateDefinition } from '../types';

export const K8sRecon: TemplateDefinition = {
  name: 'k8s-recon',
  displayName: 'Kubernetes Recon',
  description:
    'Unauthenticated Kubernetes recon: remote cluster misconfiguration discovery (kube-hunter) ' +
    'and exposed-kubelet enumeration (kubeletctl). No credentials required. ' +
    'Set the engagement target to the cluster API host or node IP.',
  steps: [
    { scannerName: 'kube-hunter', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'kubeletctl', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
