import { FindomainScanner } from '../findomain.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('FindomainScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(FindomainScanner.name).toBe('findomain');
    expect(FindomainScanner.displayName).toBe('Findomain');
    expect(FindomainScanner.docker.image).toBe('edu4rdshl/findomain:9.0.4');
    expect(FindomainScanner.docker.network).toBe('bridge');
    expect(FindomainScanner.docker.readonlyRootfs).toBe(true);
    expect(FindomainScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(FindomainScanner.produces).toContain('Subdomain');
  });

  it('inputSchema applies defaults', () => {
    expect(FindomainScanner.inputSchema.parse({})).toEqual({});
  });

  it('build() emits findomain quiet stdout for the target domain', () => {
    const input = FindomainScanner.inputSchema.parse({});
    const { cmd } = FindomainScanner.build(input, 'example.com', ctx);
    expect(cmd).toEqual(['findomain', '--target', 'example.com', '--quiet']);
  });
});
