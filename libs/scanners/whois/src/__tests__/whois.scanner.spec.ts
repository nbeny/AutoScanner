import { WhoisScanner } from '../whois.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('WhoisScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(WhoisScanner.name).toBe('whois');
    expect(WhoisScanner.docker.image).toBe('autoscanner/whois:1.0');
    expect(WhoisScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'whois-text',
    });
    expect(WhoisScanner.produces).toEqual(expect.arrayContaining(['Email', 'OrgMetadata']));
  });

  it('build() runs whois on the target', () => {
    const { cmd } = WhoisScanner.build(WhoisScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd).toEqual(['whois', 'example.com']);
  });
});
