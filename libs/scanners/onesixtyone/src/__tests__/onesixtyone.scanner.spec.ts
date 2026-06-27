import { OnesixtyoneScanner } from '../onesixtyone.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('OnesixtyoneScanner', () => {
  it('pinned image, bridge, no caps, readonlyRootfs', () => {
    expect(OnesixtyoneScanner.name).toBe('onesixtyone');
    expect(OnesixtyoneScanner.docker.image).toBe('autoscanner/onesixtyone:1.0');
    expect(OnesixtyoneScanner.docker.network).toBe('bridge');
    expect(OnesixtyoneScanner.docker.capabilities).toEqual([]);
    expect(OnesixtyoneScanner.docker.readonlyRootfs).toBe(true);
  });

  it('build() uses bundled wordlist when communityList is empty', () => {
    const input = OnesixtyoneScanner.inputSchema.parse({ targets: ['10.0.0.1', '10.0.0.2'] });
    const { cmd } = OnesixtyoneScanner.build(input, '10.0.0.1', ctx);
    expect(cmd[2]).toContain('/opt/onesixtyone/communities.txt');
    expect(cmd[2]).toContain('10.0.0.1');
    expect(cmd[2]).toContain('10.0.0.2');
  });

  it('build() writes custom community list when provided', () => {
    const input = OnesixtyoneScanner.inputSchema.parse({
      targets: ['10.0.0.1'],
      communityList: ['public', 'private', 'foo'],
    });
    const { cmd } = OnesixtyoneScanner.build(input, '10.0.0.1', ctx);
    expect(cmd[2]).toContain('public');
    expect(cmd[2]).toContain('foo');
    expect(cmd[2]).not.toContain('/opt/onesixtyone/communities.txt');
  });

  it('falls back to target when targets empty', () => {
    const input = OnesixtyoneScanner.inputSchema.parse({});
    const { cmd } = OnesixtyoneScanner.build(input, '10.0.0.1', ctx);
    expect(cmd[2]).toContain('10.0.0.1');
  });

  it('declares TEXT stdout → onesixtyone-text, produces Service+Finding', () => {
    expect(OnesixtyoneScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'onesixtyone-text',
    });
    expect(OnesixtyoneScanner.produces).toEqual(['Service', 'Finding']);
  });
});
