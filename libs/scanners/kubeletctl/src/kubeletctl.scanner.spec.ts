import { KubeletctlScanner } from './kubeletctl.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp' };

describe('KubeletctlScanner', () => {
  it('declares identity, K8s category and output parser', () => {
    expect(KubeletctlScanner.name).toBe('kubeletctl');
    expect(KubeletctlScanner.produces).toEqual(['Finding']);
    expect(KubeletctlScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'kubeletctl-json',
    });
  });

  it('builds an anonymous pods listing over the target', () => {
    const { cmd } = KubeletctlScanner.build({}, '10.0.0.5', ctx);
    expect(cmd).toEqual(['kubeletctl', 'pods', '--server', '10.0.0.5', '-o', 'json']);
  });
});
