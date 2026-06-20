import { KubeHunterScanner } from './kube-hunter.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp' };

describe('KubeHunterScanner', () => {
  it('declares identity, K8s category and output parser', () => {
    expect(KubeHunterScanner.name).toBe('kube-hunter');
    expect(KubeHunterScanner.produces).toEqual(['Finding']);
    expect(KubeHunterScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'kube-hunter-json',
    });
    expect(KubeHunterScanner.docker.image).toBe('aquasec/kube-hunter:0.6.8');
  });

  it('builds a remote JSON report command over the target', () => {
    const { cmd } = KubeHunterScanner.build({}, '10.0.0.5', ctx);
    expect(cmd).toEqual([
      'kube-hunter',
      '--remote',
      '10.0.0.5',
      '--report',
      'json',
      '--log',
      'none',
    ]);
  });
});
