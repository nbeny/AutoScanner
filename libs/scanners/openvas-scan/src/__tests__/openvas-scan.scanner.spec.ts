import { OpenvasScanScanner } from '../openvas-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('OpenvasScanScanner', () => {
  it('joins the greenbone network, needs OPENVAS cred, JSON → openvasd-json, produces Finding', () => {
    expect(OpenvasScanScanner.name).toBe('openvas-scan');
    expect(OpenvasScanScanner.docker.network).toEqual({ name: 'autoscanner-greenbone' });
    expect(OpenvasScanScanner.requiresCredential).toBe('OPENVAS');
    expect(OpenvasScanScanner.credentialEnvVar).toBe('OPENVASD_API_KEY');
    expect(OpenvasScanScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'openvasd-json',
    });
    expect(OpenvasScanScanner.produces).toEqual(['Finding']);
  });

  it('build() passes the target to the image entrypoint and sets OPENVASD_URL', () => {
    const { cmd, env } = OpenvasScanScanner.build(
      OpenvasScanScanner.inputSchema.parse({}),
      'scanme.test',
      ctx,
    );
    expect(cmd).toEqual(['openvas-scan-run', 'scanme.test']);
    expect(env?.['OPENVASD_URL']).toBe('http://openvasd:3000');
  });
});
