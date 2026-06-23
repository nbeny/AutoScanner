import { ParamspiderScanner } from '../paramspider.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('ParamspiderScanner', () => {
  it('declares name, image, file output → urllines-text, produces Endpoint', () => {
    expect(ParamspiderScanner.name).toBe('paramspider');
    expect(ParamspiderScanner.docker.image).toBe('autoscanner/paramspider:1.0');
    expect(ParamspiderScanner.docker.readonlyRootfs).toBe(false);
    expect(ParamspiderScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: { path: 'paramspider.txt' },
      parser: 'urllines-text',
    });
    expect(ParamspiderScanner.produces).toEqual(['Endpoint']);
  });

  it('build() runs paramspider in scratchDir and collects results into paramspider.txt', () => {
    const { cmd } = ParamspiderScanner.build(
      ParamspiderScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('cd /scratch');
    expect(cmd[2]).toContain("paramspider -d 'example.com'");
    expect(cmd[2]).toContain('/scratch/results/');
    expect(cmd[2]).toContain('/scratch/paramspider.txt');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = ParamspiderScanner.build(
      ParamspiderScanner.inputSchema.parse({}),
      'a.com; id',
      ctx,
    );
    expect(cmd[2]).toContain("'a.com; id'");
  });
});
