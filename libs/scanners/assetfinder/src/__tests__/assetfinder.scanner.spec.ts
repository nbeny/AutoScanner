import { AssetfinderScanner } from '../assetfinder.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('AssetfinderScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(AssetfinderScanner.name).toBe('assetfinder');
    expect(AssetfinderScanner.displayName).toBe('Assetfinder');
    expect(AssetfinderScanner.docker.image).toBe('autoscanner/assetfinder:1.0');
    expect(AssetfinderScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(AssetfinderScanner.produces).toContain('Subdomain');
  });

  it('build() runs assetfinder with --subs-only for the target', () => {
    const input = AssetfinderScanner.inputSchema.parse({});
    const { cmd } = AssetfinderScanner.build(input, 'example.com', ctx);
    expect(cmd).toEqual(['assetfinder', '--subs-only', 'example.com']);
  });
});
