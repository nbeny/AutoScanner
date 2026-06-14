import { Wafw00fScanner } from '../wafw00f.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('Wafw00fScanner', () => {
  it('declares name, docker image, JSON output → wafw00f-json parser, produces Technology', () => {
    expect(Wafw00fScanner.name).toBe('wafw00f');
    expect(Wafw00fScanner.docker.image).toBe('autoscanner/wafw00f:1.0');
    expect(Wafw00fScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'wafw00f-json',
    });
    expect(Wafw00fScanner.produces).toEqual(expect.arrayContaining(['Technology']));
    expect(Wafw00fScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs wafw00f via sh -lc with shell-quoted target and -f json', () => {
    const { cmd } = Wafw00fScanner.build(Wafw00fScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('wafw00f');
    expect(cmd[2]).toContain("'example.com'");
    expect(cmd[2]).toContain('-f json');
  });
});
