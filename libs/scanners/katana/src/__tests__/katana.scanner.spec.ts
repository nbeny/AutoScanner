import { KatanaScanner } from '../katana.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('KatanaScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(KatanaScanner.name).toBe('katana');
    expect(KatanaScanner.displayName).toBe('Katana');
    expect(KatanaScanner.docker.image).toBe('projectdiscovery/katana:v1.6.1');
    expect(KatanaScanner.outputs[0]).toEqual({
      format: 'JSONL',
      capture: 'stdout',
      parser: 'katana-json',
    });
    expect(KatanaScanner.produces).toContain('Endpoint');
  });

  it('inputSchema default depth is 3', () => {
    expect(KatanaScanner.inputSchema.parse({})).toEqual({ depth: 3 });
  });

  it('build() crawls the target with jsonl + silent + depth', () => {
    const input = KatanaScanner.inputSchema.parse({});
    const { cmd } = KatanaScanner.build(input, 'example.com', ctx);
    expect(cmd).toEqual(['katana', '-u', 'example.com', '-jsonl', '-silent', '-d', '3']);
  });

  it('rejects depth out of range', () => {
    expect(() => KatanaScanner.inputSchema.parse({ depth: 0 })).toThrow();
    expect(() => KatanaScanner.inputSchema.parse({ depth: 11 })).toThrow();
  });

  it('attaches session headers for authenticated crawl when auth is configured', () => {
    const input = KatanaScanner.inputSchema.parse({});
    const { cmd } = KatanaScanner.build(input, 'example.com', {
      ...ctx,
      auth: { cookie: 'session=abc', headers: { Authorization: 'Bearer xyz' } },
    });
    expect(cmd).toEqual([
      'katana',
      '-u',
      'example.com',
      '-jsonl',
      '-silent',
      '-d',
      '3',
      '-H',
      'Cookie: session=abc',
      '-H',
      'Authorization: Bearer xyz',
    ]);
  });
});
