import { WaymoreScanner } from '../waymore.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('WaymoreScanner', () => {
  it('declares name, image, file output → urllines-text, produces Endpoint', () => {
    expect(WaymoreScanner.name).toBe('waymore');
    expect(WaymoreScanner.docker.image).toBe('autoscanner/waymore:1.0');
    expect(WaymoreScanner.docker.readonlyRootfs).toBe(false);
    expect(WaymoreScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: { path: 'waymore.txt' },
      parser: 'urllines-text',
    });
    expect(WaymoreScanner.produces).toEqual(['Endpoint']);
  });

  it('build() harvests URLs (mode U) to scratchDir', () => {
    const { cmd } = WaymoreScanner.build(WaymoreScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain("waymore -i 'example.com'");
    expect(cmd[2]).toContain('-mode U');
    expect(cmd[2]).toContain('-oU /scratch/waymore.txt');
  });

  it('build() honours mode R', () => {
    const { cmd } = WaymoreScanner.build(
      WaymoreScanner.inputSchema.parse({ mode: 'R' }),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain('-mode R');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = WaymoreScanner.build(WaymoreScanner.inputSchema.parse({}), 'a.com; id', ctx);
    expect(cmd[2]).toContain("'a.com; id'");
  });
});
