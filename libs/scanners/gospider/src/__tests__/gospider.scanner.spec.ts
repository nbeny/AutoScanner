import { GospiderScanner } from '../gospider.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/scratch' };

describe('GospiderScanner', () => {
  it('declares name, image, JSONL stdout → gospider-json, produces Endpoint+Asset', () => {
    expect(GospiderScanner.name).toBe('gospider');
    expect(GospiderScanner.docker.image).toBe('autoscanner/gospider:1.0');
    expect(GospiderScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'gospider-json',
    });
    expect(GospiderScanner.produces).toEqual(['Endpoint', 'Asset']);
  });

  it('build() uses defaults: depth 3, concurrency 10, no -a, no --subs', () => {
    const input = GospiderScanner.inputSchema.parse({});
    const { cmd } = GospiderScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toContain('gospider');
    expect(cmd).toContain('-s');
    expect(cmd).toContain('https://acme.tld');
    expect(cmd).toContain('-d');
    expect(cmd).toContain('3');
    expect(cmd).toContain('-c');
    expect(cmd).toContain('10');
    expect(cmd).toContain('--json');
    expect(cmd).toContain('--no-redirect');
    expect(cmd).not.toContain('-a');
    expect(cmd).not.toContain('--subs');
  });

  it('build() appends -a when includeOtherSources is true', () => {
    const input = GospiderScanner.inputSchema.parse({ includeOtherSources: true });
    const { cmd } = GospiderScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toContain('-a');
  });

  it('build() appends --subs when includeSubs is true', () => {
    const input = GospiderScanner.inputSchema.parse({ includeSubs: true });
    const { cmd } = GospiderScanner.build(input, 'https://acme.tld', ctx);
    expect(cmd).toContain('--subs');
  });

  it('rejects concurrency > 50 via zod', () => {
    expect(() => GospiderScanner.inputSchema.parse({ concurrency: 9999 })).toThrow();
  });
});
