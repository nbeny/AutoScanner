import type { ScannerDefinition, ScannerDockerSpec } from '../types';
import { z } from 'zod';

describe('SDK supports named docker network + OPENVAS credential', () => {
  it('accepts a named network in ScannerDockerSpec', () => {
    const docker: ScannerDockerSpec = {
      image: 'x:1',
      network: { name: 'autoscanner-greenbone' },
      capabilities: [],
      readonlyRootfs: true,
      memoryLimitMb: 256,
      cpuQuota: 1_000_000,
      defaultTimeoutMs: 1000,
    };
    expect(typeof docker.network === 'object' ? docker.network.name : docker.network).toBe(
      'autoscanner-greenbone',
    );
  });

  it("accepts requiresCredential: 'OPENVAS'", () => {
    const def: Pick<ScannerDefinition, 'requiresCredential' | 'credentialEnvVar'> = {
      requiresCredential: 'OPENVAS',
      credentialEnvVar: 'OPENVASD_API_KEY',
    };
    expect(def.requiresCredential).toBe('OPENVAS');
    expect(z.object({}).parse({})).toEqual({});
  });
});
