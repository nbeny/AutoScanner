import { K8sRecon } from '../builtins/k8s-recon';
import { BUILTIN_TEMPLATES } from '../builtins';

describe('k8s-recon template', () => {
  it('runs kube-hunter then kubeletctl over the target', () => {
    expect(K8sRecon.name).toBe('k8s-recon');
    expect(K8sRecon.steps.map((s) => s.scannerName)).toEqual(['kube-hunter', 'kubeletctl']);
    expect(K8sRecon.steps[0].target).toEqual({ kind: 'context', path: 'target' });
    expect(K8sRecon.steps[1].target).toEqual({ kind: 'context', path: 'target' });
  });

  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.some((t) => t.name === 'k8s-recon')).toBe(true);
  });
});
