import { GowitnessScanner } from '../gowitness.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/output' };

describe('GowitnessScanner', () => {
  it('declares BINARY file capture, no credential, no parse', () => {
    expect(GowitnessScanner.name).toBe('gowitness');
    expect(GowitnessScanner.docker.image).toBe('autoscanner/gowitness:1.0');
    expect(GowitnessScanner.outputs[0].format).toBe('BINARY');
    expect(GowitnessScanner.outputs[0].capture).toEqual({ path: '' });
    expect(GowitnessScanner.requiresCredential).toBeUndefined();
  });

  it('build() writes the screenshot into ctx.scratchDir and quotes the target', () => {
    const { cmd } = GowitnessScanner.build(
      GowitnessScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('gowitness');
    expect(cmd[2]).toContain("'example.com'");
    expect(cmd[2]).toContain('--screenshot-path /output');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = GowitnessScanner.build(
      GowitnessScanner.inputSchema.parse({}),
      'a.com; rm -rf /',
      ctx,
    );
    expect(cmd[2]).toContain("'a.com; rm -rf /'");
  });
});
