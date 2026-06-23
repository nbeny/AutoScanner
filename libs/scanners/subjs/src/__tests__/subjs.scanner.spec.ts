import { SubjsScanner } from '../subjs.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('SubjsScanner', () => {
  it('declares name, image, TEXT stdout → subjs-text, produces Endpoint', () => {
    expect(SubjsScanner.name).toBe('subjs');
    expect(SubjsScanner.docker.image).toBe('autoscanner/subjs:1.0');
    expect(SubjsScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'subjs-text',
    });
    expect(SubjsScanner.produces).toEqual(['Endpoint']);
  });

  it('build() feeds an https URL for the target into subjs on stdin', () => {
    const { cmd } = SubjsScanner.build(SubjsScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[2]).toContain('subjs');
    expect(cmd[2]).toContain("'example.com'");
    expect(cmd[2]).toContain('https://');
  });
});
