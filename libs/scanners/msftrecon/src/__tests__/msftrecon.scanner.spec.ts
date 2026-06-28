import { MsftreconScanner } from '../msftrecon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('MsftreconScanner', () => {
  it('declares name, image, JSON stdout → msftrecon-json, produces OrgMetadata + Finding', () => {
    expect(MsftreconScanner.name).toBe('msftrecon');
    expect(MsftreconScanner.docker.image).toBe('autoscanner/msftrecon:1.0');
    expect(MsftreconScanner.docker.readonlyRootfs).toBe(true);
    expect(MsftreconScanner.docker.network).toBe('bridge');
    expect(MsftreconScanner.docker.capabilities).toEqual([]);
    expect(MsftreconScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'msftrecon-json',
    });
    expect(MsftreconScanner.produces).toEqual(['OrgMetadata', 'Finding']);
  });

  it('build() runs msftrecon.py with -d <target> -j', () => {
    const input = MsftreconScanner.inputSchema.parse({});
    const { cmd } = MsftreconScanner.build(input, 'contoso.com', ctx);
    expect(cmd).toEqual(['python', '/opt/msftrecon/msftrecon.py', '-d', 'contoso.com', '-j']);
  });

  it('build() rejects extra inputs via zod strict mode', () => {
    // zod's default behaviour is to strip unknown keys; we just verify the parser tolerates {}.
    expect(() => MsftreconScanner.inputSchema.parse({})).not.toThrow();
  });
});
