import { WebanalyzeScanner } from '../webanalyze.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('WebanalyzeScanner', () => {
  it('declares name, image, JSON stdout → webanalyze-json, produces Technology', () => {
    expect(WebanalyzeScanner.name).toBe('webanalyze');
    expect(WebanalyzeScanner.docker.image).toBe('autoscanner/webanalyze:1.0');
    expect(WebanalyzeScanner.outputs[0]).toEqual({
      format: 'JSON',
      capture: 'stdout',
      parser: 'webanalyze-json',
    });
    expect(WebanalyzeScanner.produces).toEqual(['Technology']);
  });

  it('build() runs webanalyze against the host with the baked apps file and json output', () => {
    const { cmd } = WebanalyzeScanner.build(
      WebanalyzeScanner.inputSchema.parse({}),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain('webanalyze');
    expect(cmd[2]).toContain('-host');
    expect(cmd[2]).toContain("'example.com'");
    expect(cmd[2]).toContain('-output json');
    expect(cmd[2]).toContain('-apps /technologies.json');
  });

  it('build() passes -crawl when crawlDepth > 0', () => {
    const { cmd } = WebanalyzeScanner.build(
      WebanalyzeScanner.inputSchema.parse({ crawlDepth: 2 }),
      'example.com',
      ctx,
    );
    expect(cmd[2]).toContain('-crawl 2');
  });
});
